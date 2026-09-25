import type { Money } from "../types";
import { toGTQ } from "./currency";

/**
 * Brecha salarial = (deseado − actual) / actual, ambos normalizados a GTQ.
 *
 * Por qué no necesita modelo: es aritmética. Las bandas son una tabla de umbrales
 * explícita (regla práctica, no estadística oficial): un cambio de trabajo "normal" en
 * Guatemala suele moverse entre 10 % y 20 %; arriba de 35 % casi siempre implica cambio de
 * rol o de mercado (p. ej., trabajo remoto en dólares). Los números que ve la persona salen
 * de aquí, nunca del LLM.
 */
export type GapBand = "recorte" | "conservador" | "razonable" | "ambicioso" | "agresivo";

export interface GapBandRule {
  band: GapBand;
  /** Límite inferior inclusivo en %. */
  min: number;
  /** Límite superior exclusivo en %. */
  max: number;
  label: string;
  advice: string;
}

export const GAP_BANDS: GapBandRule[] = [
  { band: "recorte", min: -Infinity, max: 0, label: "Pides menos que hoy", advice: "Solo tiene sentido si ganas otra cosa (aprendizaje, horario, remoto). Dilo en esos términos, no como descuento." },
  { band: "conservador", min: 0, max: 10, label: "Conservador", advice: "Fácil de aceptar. Probablemente estás dejando dinero en la mesa: revisa si el rol lo justifica." },
  { band: "razonable", min: 10, max: 20, label: "Razonable", advice: "Es el rango típico de un cambio de trabajo. Defiéndelo con 1–2 logros medibles." },
  { band: "ambicioso", min: 20, max: 35, label: "Ambicioso", advice: "Alcanzable si el rol nuevo es más grande que el actual. Llega con evidencia de impacto." },
  { band: "agresivo", min: 35, max: Infinity, label: "Agresivo", advice: "Solo se sostiene con un salto de rol o de mercado. Prepara un plan B (bono, fecha de revisión, remoto)." },
];

export interface SalaryGap {
  currentGTQ: number;
  desiredGTQ: number;
  deltaGTQ: number;
  /** Porcentaje redondeado a 1 decimal. */
  pct: number;
  band: GapBand;
  rule: GapBandRule;
}

export function bandFor(pct: number): GapBandRule {
  return GAP_BANDS.find((b) => pct >= b.min && pct < b.max) ?? GAP_BANDS[GAP_BANDS.length - 1];
}

export function salaryGap(current: Money, desired: Money): SalaryGap {
  const currentGTQ = toGTQ(current.amount, current.currency);
  const desiredGTQ = toGTQ(desired.amount, desired.currency);
  if (!(currentGTQ > 0)) throw new Error("El salario actual debe ser mayor que cero");
  const pct = Math.round(((desiredGTQ - currentGTQ) / currentGTQ) * 1000) / 10;
  const rule = bandFor(pct);
  return { currentGTQ, desiredGTQ, deltaGTQ: desiredGTQ - currentGTQ, pct, band: rule.band, rule };
}
