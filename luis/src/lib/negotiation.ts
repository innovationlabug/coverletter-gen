/**
 * Private negotiation note — 100 % local and deterministic.
 * Uses the current salary, so it must never be serialized to any request.
 */
import {
  DAYS_PER_MONTH,
  FX_GTQ_PER_USD,
  HOURS_PER_MONTH,
  WEEKS_PER_MONTH,
} from "@/config/constants";
import { parseAmount } from "./redact";
import type { Currency, Profile, SalaryBenchmark, SalaryPeriod } from "./types";

export type BandId = "below" | "conservative" | "realistic" | "ambitious" | "out_of_range";

export interface Band {
  id: BandId;
  label: string;
  summary: string;
}

export const BANDS: Record<BandId, Band> = {
  below: {
    id: "below",
    label: "Por debajo de tu salario actual",
    summary: "Pides menos de lo que ganas hoy. Asegúrate de que sea intencional (p. ej. cambio de carrera o de país).",
  },
  conservative: {
    id: "conservative",
    label: "Conservadora",
    summary: "Menos de 10 % de aumento: probablemente estás dejando dinero en la mesa.",
  },
  realistic: {
    id: "realistic",
    label: "Realista",
    summary: "Entre 10 % y 30 %: el rango habitual al cambiar de empresa.",
  },
  ambitious: {
    id: "ambitious",
    label: "Ambiciosa — justifícala",
    summary: "Entre 30 % y 60 %: posible, pero necesitas logros medibles o un salto claro de responsabilidades.",
  },
  out_of_range: {
    id: "out_of_range",
    label: "Fuera de rango sin cambio de rol/seniority",
    summary: "Más de 60 %: solo es defendible si el puesto es de otro nivel (seniority, liderazgo, mercado internacional).",
  },
};

/** Gap % → band. Boundaries: <10 conservadora, 10–30 realista, 30–60 ambiciosa, >60 fuera de rango. */
export function bandForGap(gapPct: number): Band {
  if (gapPct < 0) return BANDS.below;
  if (gapPct < 10) return BANDS.conservative;
  if (gapPct <= 30) return BANDS.realistic;
  if (gapPct <= 60) return BANDS.ambitious;
  return BANDS.out_of_range;
}

export function toGTQ(amount: number, currency: Currency | string): number | null {
  if (currency === "GTQ") return amount;
  if (currency === "USD") return amount * FX_GTQ_PER_USD;
  return null;
}

export function fromGTQ(amountGTQ: number, currency: Currency): number {
  return currency === "GTQ" ? amountGTQ : amountGTQ / FX_GTQ_PER_USD;
}

/** Normalize an amount expressed per `period` to a monthly amount. */
export function toMonthly(amount: number, period: SalaryPeriod | string): number {
  switch (period) {
    case "YEAR":
      return amount / 12;
    case "MONTH":
      return amount;
    case "WEEK":
      return amount * WEEKS_PER_MONTH;
    case "DAY":
      return amount * DAYS_PER_MONTH;
    case "HOUR":
      return amount * HOURS_PER_MONTH;
    default:
      return amount;
  }
}

export function gapPercent(currentGTQ: number, desiredGTQ: number): number {
  if (currentGTQ <= 0) return Number.NaN;
  return ((desiredGTQ - currentGTQ) / currentGTQ) * 100;
}

export function formatMoney(amount: number, currency: Currency | string): string {
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(amount));
  if (currency === "GTQ") return `Q${n}`;
  if (currency === "USD") return `US$${n}`;
  return `${n} ${currency}`;
}

// ---------------------------------------------------------------------------
// Salary range inside a pasted job offer
// ---------------------------------------------------------------------------

export interface OfferRange {
  min: number;
  max: number;
  currency: Currency;
  currencyAssumed: boolean;
  period: "MONTH" | "YEAR" | "HOUR";
  raw: string;
}

const NUM = String.raw`(?:\d{1,3}(?:[.,\u00a0 ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const AMOUNT = String.raw`((?:US\s?\$|USD|GTQ|Q\.?|\$)?\s?${NUM}(?:\s?(?:k|mil)(?![\p{L}]))?(?:\s?(?:quetzales|dólares|dolares|USD|GTQ)(?![\p{L}]))?)`;
const RANGE_RE = new RegExp(
  String.raw`(?:entre\s+|de\s+)?${AMOUNT}\s*(?:-|–|—|a|al|y|hasta)\s*${AMOUNT}`,
  "giu",
);
const SINGLE_RE = new RegExp(
  String.raw`(?:salario|sueldo|pago|compensaci[oó]n|remuneraci[oó]n|ofrecemos)[^.\n\d$Q]{0,40}${AMOUNT}`,
  "giu",
);

function detectCurrency(s: string): Currency | null {
  if (/US\s?\$|USD|dólar|dolar|\$/i.test(s)) return "USD";
  if (/(?<![\p{L}])Q\.?\s?\d|GTQ|quetzal/iu.test(s)) return "GTQ";
  return null;
}

function hasMoneyMarker(s: string): boolean {
  return detectCurrency(s) !== null || /\d\s?(k|mil)(?![\p{L}])/iu.test(s);
}

/**
 * Find a salary range (or a single salary) in the job offer text.
 * Requires a currency/scale marker or amounts ≥ 1,000 so "2-3 años" is ignored.
 */
export function findOfferRange(text: string, fallbackCurrency: Currency = "GTQ"): OfferRange | null {
  if (!text) return null;
  const periodOf = (i: number): OfferRange["period"] => {
    const around = text.slice(Math.max(0, i - 60), i + 120).toLowerCase();
    if (/anual|al año|por año|annual|per year/.test(around)) return "YEAR";
    if (/por hora|\/h\b|per hour|hourly/.test(around)) return "HOUR";
    return "MONTH";
  };

  for (const m of text.matchAll(RANGE_RE)) {
    const [raw, a, b] = m;
    let lo = parseAmount(a.trim());
    const hi = parseAmount(b.trim());
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    // "de 8 a 12 mil" → the scale applies to both ends.
    const scaled = (x: string) => /\d\s?(k|mil)(?![\p{L}])/iu.test(x);
    if (scaled(b) && !scaled(a) && lo < 1000) lo *= 1000;
    const marked = hasMoneyMarker(raw);
    if (!marked && (lo < 1000 || hi < 1000)) continue;
    if (lo <= 0 || hi < lo || hi / lo > 5) continue;
    const cur = detectCurrency(raw);
    return {
      min: lo,
      max: hi,
      currency: cur ?? fallbackCurrency,
      currencyAssumed: cur === null,
      period: periodOf(m.index ?? 0),
      raw: raw.trim(),
    };
  }
  for (const m of text.matchAll(SINGLE_RE)) {
    const amount = m[1].trim();
    const v = parseAmount(amount);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (!hasMoneyMarker(amount) && v < 1000) continue;
    const cur = detectCurrency(amount);
    return {
      min: v,
      max: v,
      currency: cur ?? fallbackCurrency,
      currencyAssumed: cur === null,
      period: periodOf(m.index ?? 0),
      raw: m[0].trim(),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The note
// ---------------------------------------------------------------------------

export interface NoteSection {
  id: "realism" | "market" | "offer" | "when" | "never";
  title: string;
  items: string[];
}

export interface MarketComparison {
  minGTQ: number;
  medianGTQ: number;
  maxGTQ: number;
  position: "below_min" | "min_median" | "median_max" | "above_max";
  source: string;
  confidence: string | null;
  salaryCount: number | null;
  updatedAt: string | null;
  fromCache: boolean;
  originalPeriod: string;
  originalCurrency: string;
}

export interface NegotiationNote {
  headline: string;
  band: Band;
  gapPct: number;
  currentMonthlyGTQ: number;
  desiredMonthlyGTQ: number;
  market: MarketComparison | null;
  marketUnavailableReason: string | null;
  offerRange: OfferRange | null;
  suggestedRange: { min: number; max: number; currency: Currency };
  sections: NoteSection[];
  fxNote: string;
}

export interface NoteInputs {
  profile: Profile;
  benchmark?: SalaryBenchmark | null;
  benchmarkFromCache?: boolean;
  /** Why there is no benchmark (shown in the note). */
  benchmarkUnavailableReason?: string | null;
}

function roundTo(n: number, currency: Currency): number {
  const step = currency === "GTQ" ? 500 : 50;
  return Math.round(n / step) * step;
}

export function compareWithMarket(
  benchmark: SalaryBenchmark,
  desiredGTQ: number,
  fromCache = false,
): MarketComparison | null {
  const conv = (v: number) => toGTQ(toMonthly(v, benchmark.period), benchmark.currency);
  const minGTQ = conv(benchmark.minSalary);
  const medianGTQ = conv(benchmark.medianSalary);
  const maxGTQ = conv(benchmark.maxSalary);
  if (minGTQ === null || medianGTQ === null || maxGTQ === null) return null;
  const position: MarketComparison["position"] =
    desiredGTQ < minGTQ
      ? "below_min"
      : desiredGTQ <= medianGTQ
        ? "min_median"
        : desiredGTQ <= maxGTQ
          ? "median_max"
          : "above_max";
  return {
    minGTQ,
    medianGTQ,
    maxGTQ,
    position,
    source: benchmark.publisher ?? "JSearch",
    confidence: benchmark.confidence,
    salaryCount: benchmark.salaryCount,
    updatedAt: benchmark.updatedAt,
    fromCache,
    originalPeriod: benchmark.period,
    originalCurrency: benchmark.currency,
  };
}

const POSITION_TEXT: Record<MarketComparison["position"], string> = {
  below_min: "por debajo del mínimo del mercado — puedes pedir más",
  min_median: "entre el mínimo y la mediana — defendible sin mucho esfuerzo",
  median_max: "entre la mediana y el máximo — necesitas justificarlo con logros",
  above_max: "por encima del máximo reportado — solo con un perfil fuera de lo común",
};

export function buildNegotiationNote(input: NoteInputs): NegotiationNote {
  const { profile } = input;
  const cur = profile.desiredCurrency;
  const currentGTQ = toGTQ(profile.currentSalary, profile.currentCurrency) ?? profile.currentSalary;
  const desiredGTQ = toGTQ(profile.desiredSalary, profile.desiredCurrency) ?? profile.desiredSalary;
  const gap = gapPercent(currentGTQ, desiredGTQ);
  const band = bandForGap(gap);
  const fmt = (gtq: number) => formatMoney(fromGTQ(gtq, cur), cur);
  const gapText = `${gap >= 0 ? "+" : ""}${Math.round(gap)} %`;

  // --- realism
  const realism: NoteSection = {
    id: "realism",
    title: "¿Qué tan realista es tu expectativa?",
    items: [
      `Actual: ${formatMoney(profile.currentSalary, profile.currentCurrency)} → deseado: ${formatMoney(
        profile.desiredSalary,
        profile.desiredCurrency,
      )} mensuales (${gapText}).`,
      `${band.label}. ${band.summary}`,
    ],
  };

  // --- market
  const market = input.benchmark
    ? compareWithMarket(input.benchmark, desiredGTQ, input.benchmarkFromCache ?? false)
    : null;
  const marketSection: NoteSection = { id: "market", title: "Contra el mercado", items: [] };
  let marketUnavailableReason: string | null = null;
  if (market && input.benchmark) {
    const b = input.benchmark;
    marketSection.items.push(
      `Rango para «${b.jobTitle}» en ${b.location}: ${fmt(market.minGTQ)} – ${fmt(market.maxGTQ)} al mes (mediana ${fmt(
        market.medianGTQ,
      )}).`,
      `Tu expectativa queda ${POSITION_TEXT[market.position]}.`,
      `Fuente: ${market.source}${market.salaryCount ? `, ${market.salaryCount} salarios reportados` : ""}${
        market.confidence ? `, confianza ${market.confidence}` : ""
      }${market.updatedAt ? `, actualizado ${market.updatedAt.slice(0, 10)}` : ""}${
        market.fromCache ? " (desde caché local)" : ""
      }.`,
    );
    if (b.period !== "MONTH" || b.currency !== cur) {
      marketSection.items.push(
        `Normalizado desde ${b.period === "YEAR" ? "anual" : b.period === "HOUR" ? "por hora" : b.period.toLowerCase()} en ${b.currency} a mensual en ${cur}.`,
      );
    }
    if (market.salaryCount !== null && market.salaryCount < 10) {
      marketSection.items.push("Ojo: muestra pequeña, úsalo como referencia y no como verdad.");
    }
  } else {
    marketUnavailableReason =
      input.benchmarkUnavailableReason ??
      (input.benchmark ? "Moneda del benchmark no convertible." : "Sin referencia de mercado.");
    marketSection.items.push(
      `${marketUnavailableReason} La nota se basa solo en tu salario actual y la oferta.`,
    );
  }

  // --- offer
  const offerRange = findOfferRange(profile.jobOffer, cur);
  const offerSection: NoteSection = { id: "offer", title: "Lo que dice la oferta", items: [] };
  let offerMinGTQ: number | null = null;
  let offerMaxGTQ: number | null = null;
  if (!profile.jobOffer.trim()) {
    offerSection.items.push("No pegaste una oferta; no hay rango publicado contra el cual comparar.");
  } else if (!offerRange) {
    offerSection.items.push("La oferta no publica salario. Es lo más común: no reveles tu número primero.");
  } else {
    offerMinGTQ = toGTQ(toMonthly(offerRange.min, offerRange.period), offerRange.currency);
    offerMaxGTQ = toGTQ(toMonthly(offerRange.max, offerRange.period), offerRange.currency);
    const single = offerRange.min === offerRange.max;
    offerSection.items.push(
      single
        ? `La oferta menciona ${formatMoney(offerRange.min, offerRange.currency)}${offerRange.period === "YEAR" ? " anuales" : ""}.`
        : `La oferta publica ${formatMoney(offerRange.min, offerRange.currency)} – ${formatMoney(
            offerRange.max,
            offerRange.currency,
          )}${offerRange.period === "YEAR" ? " anuales" : ""}.`,
    );
    if (offerRange.currencyAssumed) offerSection.items.push(`Moneda no indicada: se asumió ${offerRange.currency}.`);
    if (offerMinGTQ !== null && offerMaxGTQ !== null) {
      if (desiredGTQ > offerMaxGTQ) {
        offerSection.items.push(
          `Tu expectativa (${fmt(desiredGTQ)}) está por encima del máximo publicado: tendrás que negociar beneficios o un nivel más alto.`,
        );
      } else if (desiredGTQ < offerMinGTQ) {
        offerSection.items.push("Tu expectativa está por debajo del mínimo publicado: pide al menos el mínimo.");
      } else {
        offerSection.items.push("El rango cubre tu expectativa. Ancla en la parte alta del rango.");
      }
    }
  }

  // --- suggested range to say out loud
  let lo = desiredGTQ;
  let hi = desiredGTQ * 1.1;
  if (offerMinGTQ !== null && offerMaxGTQ !== null && desiredGTQ <= offerMaxGTQ) {
    const upper = offerMinGTQ + 0.75 * (offerMaxGTQ - offerMinGTQ);
    lo = Math.max(desiredGTQ, upper);
    hi = Math.max(lo, offerMaxGTQ);
  } else if (market && market.position === "below_min") {
    lo = Math.max(desiredGTQ, market.minGTQ);
    hi = Math.max(lo * 1.1, market.medianGTQ);
  }
  const suggestedRange = {
    min: roundTo(fromGTQ(lo, cur), cur),
    max: roundTo(fromGTQ(hi, cur), cur),
    currency: cur,
  };

  // --- when to mention it
  const when: NoteSection = { id: "when", title: "Cuándo y cómo mencionarla", items: [] };
  if (offerRange && offerRange.min !== offerRange.max) {
    when.items.push(
      "La oferta ya tiene rango: menciónalo solo cuando te lo pregunten, anclando en la parte alta.",
      `Frase sugerida: «Por lo que he visto del puesto, estaría buscando entre ${formatMoney(
        suggestedRange.min,
        cur,
      )} y ${formatMoney(suggestedRange.max, cur)} mensuales, según el paquete completo».`,
    );
  } else {
    when.items.push(
      "No lo pongas en la carta. Espera la primera llamada del reclutador o a que te pregunten.",
      "Si insisten, devuelve la pregunta: «¿Cuál es el rango que tienen presupuestado para el puesto?».",
      `Si tienes que dar un número, da un rango cuyo piso sea tu meta: ${formatMoney(
        suggestedRange.min,
        cur,
      )} – ${formatMoney(suggestedRange.max, cur)} mensuales.`,
    );
  }
  if (band.id === "ambitious" || band.id === "out_of_range") {
    when.items.push("Llega con 2–3 logros medibles que justifiquen el salto; sin eso, el reclutador lo descartará.");
  }
  if (market?.position === "above_max") {
    when.items.push("Estás por encima del máximo del mercado: considera negociar por bonos, capacitación o trabajo remoto.");
  }

  const never: NoteSection = {
    id: "never",
    title: "Lo que nunca va por escrito",
    items: [
      "Tu salario actual: ni en la carta, ni en formularios opcionales, ni en correos. Si te lo piden, responde con tu expectativa.",
      "Números en la carta de interés: la carta vende tu perfil, la negociación es otra conversación.",
      "El nombre de tu empleador actual en conversaciones con terceros si tu búsqueda es confidencial.",
    ],
  };

  return {
    headline: `${band.label}: ${gapText} sobre tu salario actual`,
    band,
    gapPct: gap,
    currentMonthlyGTQ: currentGTQ,
    desiredMonthlyGTQ: desiredGTQ,
    market,
    marketUnavailableReason,
    offerRange,
    suggestedRange,
    sections: [realism, marketSection, offerSection, when, never],
    fxNote: `Conversión con tipo de cambio fijo de ${FX_GTQ_PER_USD} GTQ por USD (constante local, sin API de cambio).`,
  };
}
