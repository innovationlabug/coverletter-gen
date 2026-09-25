import type { GapBand } from "./gap";
import type { SalaryRange } from "./offer-salary";

/**
 * "¿Cuándo menciono mi expectativa salarial?" como tabla de reglas. Gana la primera que aplica.
 *
 * Por qué no necesita modelo: es conocimiento de negociación estable y discutible en voz alta.
 * Escribirlo como tabla hace que cada consejo tenga un "porque" revisable y probado, y que
 * la respuesta no cambie entre corridas. El LLM puede redactar alrededor; no decide la regla.
 */
export interface TimingInput {
  hasOffer: boolean;
  offerRange: SalaryRange | null;
  asksExpectation: boolean;
  desiredGTQ: number;
  band: GapBand;
}

export interface TimingRule {
  id: string;
  when: (i: TimingInput) => boolean;
  moment: string;
  why: string;
}

const within = (i: TimingInput) =>
  i.offerRange !== null &&
  (i.offerRange.minGTQMonthly ?? 0) <= i.desiredGTQ &&
  i.desiredGTQ <= (i.offerRange.maxGTQMonthly ?? Infinity);

export const TIMING_RULES: TimingRule[] = [
  {
    id: "offer-asks",
    when: (i) => i.asksExpectation,
    moment: "En el formulario o correo de postulación, como rango (no en la carta).",
    why: "La oferta lo pide explícitamente: omitirlo te puede sacar del filtro. Da un rango cuyo piso sea tu número real.",
  },
  {
    id: "range-covers",
    when: (i) => within(i),
    moment: "En la primera llamada con RR. HH., sin miedo.",
    why: "Tu expectativa cae dentro del rango publicado: hablar de números temprano ahorra tiempo a ambos.",
  },
  {
    id: "range-below",
    when: (i) => i.offerRange?.minGTQMonthly != null && i.desiredGTQ < i.offerRange.minGTQMonthly,
    moment: "Cuando pregunten, apunta al rango publicado, no a tu número.",
    why: "Pides menos de lo que ellos ya ofrecen: mencionarlo primero te ancla por debajo.",
  },
  {
    id: "range-above",
    when: (i) => i.offerRange?.maxGTQMonthly != null && i.desiredGTQ > i.offerRange.maxGTQMonthly,
    moment: "Después de la entrevista técnica, cuando ya te quieran.",
    why: "Estás por encima del tope publicado: primero demuestra valor; luego negocia o pide otros componentes (bono, remoto, revisión a 6 meses).",
  },
  {
    id: "cut",
    when: (i) => i.band === "recorte",
    moment: "Solo si preguntan, y explicando qué ganas a cambio.",
    why: "Una expectativa menor a tu salario actual se lee como urgencia; enmárcala en aprendizaje, horario o estabilidad.",
  },
  {
    id: "aggressive-no-range",
    when: (i) => i.band === "agresivo",
    moment: "Deja que ellos pongan la primera cifra.",
    why: "Un salto mayor a 35 % sin rango publicado suele descartarte si lo dices antes de demostrar valor.",
  },
  {
    id: "default",
    when: () => true,
    moment: "Nunca en la carta; en la entrevista con RR. HH. cuando te pregunten.",
    why: "La carta vende tu perfil; el número se negocia cuando ya hay interés mutuo.",
  },
];

export function whenToMention(input: TimingInput): TimingRule {
  return TIMING_RULES.find((r) => r.when(input))!;
}
