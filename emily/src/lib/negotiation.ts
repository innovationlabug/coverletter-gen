/**
 * Private negotiation note. 100 % deterministic rules, runs only on the device.
 * Every threshold is a named constant so the README / article can cite it.
 */
import { formatMoney, toGTQ, USD_TO_GTQ } from './money';
import { findMoney } from './redact';
import type { Currency, Profile } from './types';

/** Gap bands (percentage of increase desired over current, both in GTQ). */
export const BANDS = [
  { id: 'recorte', max: 0, label: 'Por debajo de tu salario actual' },
  { id: 'conservadora', max: 10, label: 'Conservadora' },
  { id: 'razonable', max: 25, label: 'Razonable' },
  { id: 'ambiciosa', max: 40, label: 'Ambiciosa' },
  { id: 'muy_ambiciosa', max: Infinity, label: 'Muy ambiciosa' },
] as const;

export type BandId = (typeof BANDS)[number]['id'];

/** Extra tolerance (percentage points) when the desired role is a step up. */
export const PROMOTION_TOLERANCE_PP = 15;
/** Junior threshold in years. */
export const JUNIOR_YEARS = 2;
/** Suggested range width over the desired salary. */
export const RANGE_WIDTH = 0.1;

const SENIORITY = /\b(senior|sr\.?|lead|l[ií]der|jefe|jefa|gerente|head|director|directora|principal|staff|coordinador|coordinadora|manager|supervisor|supervisora)\b/i;
const ASKS_EXPECTATION =
  /(pretensi[oó]n(es)? salarial(es)?|expectativa(s)? salarial(es)?|aspiraci[oó]n salarial|salario (pretendido|deseado|esperado)|indicar (su |tu )?(salario|pretensi[oó]n)|salary expectations?|expected salary|desired salary|salary requirements?)/i;
const SALARY_CONTEXT = /(salario|sueldo|salary|compensaci[oó]n|pago|pay|rango|range|ofrecemos|ingreso|remuneraci[oó]n|base)/i;
const RANGE_JOINER = /^\s*(?:-|–|—|a|al|y|hasta|to|and)\s*$/i;

export interface OfferRange {
  min: number;
  max: number;
  currency: Currency;
  raw: string;
}

/**
 * Find a salary range in a pasted offer: "Q12,000 - Q15,000", "entre Q10 mil y Q14 mil",
 * "$2,000–$2,500", "USD 2000 to 2500", "Salario: Q18,000". Currency defaults to GTQ when the
 * offer does not say (Guatemalan offers are quoted in quetzales unless stated otherwise).
 */
export function parseOfferSalaryRange(offer: string | undefined): OfferRange | null {
  if (!offer) return null;
  // "12 - 14 mil", "Q10 a 14k": the multiplier is written only once, after the second number.
  const shared = /(?:(Q|GTQ|US\$|USD|\$)\s?)?(\d{1,3}(?:[.,]\d)?)\s*(?:-|–|—|a|al|y|to)\s*(?:Q|GTQ|US\$|USD|\$)?\s?(\d{1,3}(?:[.,]\d)?)\s*(mil|k|K)\b\s*(quetzales|d[óo]lares|USD|GTQ)?/i.exec(offer);
  if (shared) {
    const cur = /US|\$|d[óo]lar/i.test(`${shared[1] ?? ''}${shared[5] ?? ''}`) ? 'USD' : 'GTQ';
    const min = Number(shared[2].replace(',', '.')) * 1000;
    const max = Number(shared[3].replace(',', '.')) * 1000;
    if (max >= min) return { min, max, currency: cur, raw: shared[0] };
  }
  const mentions = findMoney(offer)
    .filter((m) => m.value >= 500)
    .sort((a, b) => a.index - b.index)
    // de-duplicate overlapping mentions (same amount matched by two rules)
    .filter((m, i, arr) => i === 0 || m.index >= arr[i - 1].index + arr[i - 1].raw.length);
  for (let i = 0; i < mentions.length - 1; i++) {
    const a = mentions[i];
    const b = mentions[i + 1];
    const between = offer.slice(a.index + a.raw.length, b.index);
    if (RANGE_JOINER.test(between) && b.value >= a.value) {
      const currency = a.currency ?? b.currency ?? 'GTQ';
      let min = a.value;
      // "Q10 - 14 mil": the first number inherits the multiplier of the second
      if (min < 1000 && b.value >= 1000 && /mil|k/i.test(b.raw)) min *= 1000;
      return { min, max: b.value, currency, raw: offer.slice(a.index, b.index + b.raw.length) };
    }
  }
  for (const m of mentions) {
    const before = offer.slice(Math.max(0, m.index - 40), m.index);
    if (SALARY_CONTEXT.test(before)) {
      return { min: m.value, max: m.value, currency: m.currency ?? 'GTQ', raw: m.raw };
    }
  }
  return null;
}

export interface NegotiationNote {
  currentGTQ: number;
  desiredGTQ: number;
  gapPct: number;
  band: { id: BandId; label: string };
  isPromotion: boolean;
  offerRange: OfferRange | null;
  offerPosition: 'below' | 'within' | 'above' | null;
  offerAsksExpectation: boolean;
  suggestedRange: { min: number; max: number; currency: Currency };
  headline: string;
  advice: string[];
  whenToMention: string[];
  constants: { USD_TO_GTQ: number; PROMOTION_TOLERANCE_PP: number; RANGE_WIDTH: number };
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export function buildNegotiationNote(p: Profile): NegotiationNote {
  const currentGTQ = toGTQ(p.salarioActual, p.monedaActual);
  const desiredGTQ = toGTQ(p.salarioDeseado, p.monedaDeseada);
  const gapPct = currentGTQ > 0 ? ((desiredGTQ - currentGTQ) / currentGTQ) * 100 : 0;
  const bandFor = gapPct < 0 ? BANDS[0] : BANDS.find((b) => b.id !== 'recorte' && gapPct < b.max)!;
  const isPromotion = SENIORITY.test(p.puestoDeseado) && !SENIORITY.test(p.puestoActual);
  const junior = p.aniosExperiencia < JUNIOR_YEARS;

  const offerRange = parseOfferSalaryRange(p.oferta);
  let offerPosition: NegotiationNote['offerPosition'] = null;
  if (offerRange) {
    const minG = toGTQ(offerRange.min, offerRange.currency);
    const maxG = toGTQ(offerRange.max, offerRange.currency);
    offerPosition = desiredGTQ < minG ? 'below' : desiredGTQ > maxG ? 'above' : 'within';
  }
  const offerAsksExpectation = ASKS_EXPECTATION.test(p.oferta ?? '');

  const step = p.monedaDeseada === 'USD' ? 50 : 500;
  const suggestedRange = {
    min: roundTo(p.salarioDeseado, step),
    max: roundTo(p.salarioDeseado * (1 + RANGE_WIDTH), step),
    currency: p.monedaDeseada,
  };

  const pct = `${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(1)} %`;
  const advice: string[] = [];
  switch (bandFor.id) {
    case 'recorte':
      advice.push('Estás pidiendo menos de lo que ganas hoy. Si es a propósito (cambio de carrera, trabajo remoto, estabilidad), está bien, pero no lo digas en la entrevista: no hace falta justificar un número bajo.');
      break;
    case 'conservadora':
      advice.push('Tu expectativa es conservadora. Tenés margen para pedir un poco más: un cambio de empresa suele justificar entre 10 % y 25 %.');
      break;
    case 'razonable':
      advice.push('Tu expectativa está en el rango típico de un cambio de empresa (10 %–25 %). Podés sostenerla sin mayor justificación.');
      break;
    case 'ambiciosa':
      advice.push('Tu expectativa es ambiciosa (25 %–40 %). Preparate para justificarla con logros medibles y con el alcance del nuevo puesto.');
      break;
    case 'muy_ambiciosa':
      advice.push('Tu expectativa supera el 40 % sobre tu salario actual. Es alcanzable sobre todo con un cambio de nivel o de mercado; tené a mano ejemplos concretos y una cifra mínima aceptable.');
      break;
  }
  if (isPromotion && gapPct >= 25) {
    advice.push(`El puesto deseado es un paso arriba en responsabilidad: eso justifica hasta ~${40 + PROMOTION_TOLERANCE_PP} % de incremento.`);
  }
  if (junior && gapPct >= 25) {
    advice.push(`Con menos de ${JUNIOR_YEARS} años de experiencia, un salto mayor al 25 % es más difícil de sostener: considerá negociar también capacitación o revisión salarial a los 6 meses.`);
  }
  if (offerRange) {
    const r = `${formatMoney(offerRange.min, offerRange.currency)}${offerRange.max !== offerRange.min ? ` – ${formatMoney(offerRange.max, offerRange.currency)}` : ''}`;
    if (offerPosition === 'within') advice.push(`La oferta publica ${r} y tu expectativa cae dentro: apuntá a la mitad superior del rango.`);
    if (offerPosition === 'above') advice.push(`La oferta publica ${r} y tu expectativa está por encima: negociá el máximo del rango más beneficios (bono, vacaciones, trabajo remoto) o preguntá si hay flexibilidad.`);
    if (offerPosition === 'below') advice.push(`La oferta publica ${r} y tu expectativa está por debajo: podés pedir más, al menos el punto medio del rango.`);
  }

  const whenToMention: string[] = [
    'Nunca escribas cifras de salario en la carta de interés.',
    'No reveles tu salario actual. Si te lo preguntan, redirigí a tu expectativa: "Para este puesto busco un rango de …".',
  ];
  if (offerAsksExpectation) {
    whenToMention.push(`La oferta pide pretensión salarial: ponela en el formulario o en el correo de envío (no en la carta), como rango: ${formatMoney(suggestedRange.min, suggestedRange.currency)} – ${formatMoney(suggestedRange.max, suggestedRange.currency)}.`);
  } else if (offerRange) {
    whenToMention.push('La oferta ya publica un rango: mencioná tu cifra hasta la primera llamada con Recursos Humanos, cuando te pregunten.');
  } else {
    whenToMention.push('Esperá a que Recursos Humanos saque el tema (normalmente en la primera llamada de filtro) y tené tu rango listo.');
  }

  const headline = `${bandFor.label}: ${pct} (de ${formatMoney(p.salarioActual, p.monedaActual)} a ${formatMoney(p.salarioDeseado, p.monedaDeseada)})`;

  return {
    currentGTQ,
    desiredGTQ,
    gapPct,
    band: { id: bandFor.id, label: bandFor.label },
    isPromotion,
    offerRange,
    offerPosition,
    offerAsksExpectation,
    suggestedRange,
    headline,
    advice,
    whenToMention,
    constants: { USD_TO_GTQ, PROMOTION_TOLERANCE_PP, RANGE_WIDTH },
  };
}
