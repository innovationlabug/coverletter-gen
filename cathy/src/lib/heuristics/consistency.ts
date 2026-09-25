import { findMoneyMentions } from "./money";

/**
 * Chequeo de consistencia numérica del texto del modelo contra lo calculado por heurísticas.
 *
 * Por qué no necesita modelo (y por qué existe): el LLM redacta, pero NO es la fuente de los
 * números. Extraemos cada monto y cada porcentaje de su texto y lo comparamos con la lista
 * de números que la app sí calculó. Lo que no cuadra se marca en la UI y cuenta como
 * "número inventado" en el benchmark. Es un regex + una tolerancia; no hay nada que aprender.
 */
export interface NumberReference {
  /** Montos válidos (en cualquier moneda que la app haya mostrado). */
  amounts: number[];
  /** Porcentajes válidos. */
  percents: number[];
}

export interface FlaggedNumber {
  raw: string;
  value: number;
  kind: "amount" | "percent";
  reason: string;
}

export interface ConsistencyResult {
  ok: boolean;
  checked: number;
  flagged: FlaggedNumber[];
}

/** Tolerancia relativa para montos: 2 % (cubre "Q15 mil" vs Q15,300 y redondeos a US$). */
export const AMOUNT_TOLERANCE = 0.02;
/** Tolerancia absoluta para porcentajes: ±1 punto. */
export const PERCENT_TOLERANCE = 1;

const PERCENT_RE = /(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:%|por ?ciento|percent)/giu;

/** Números que aparecen en un texto de la persona (logros, oferta): también son legítimos. */
export function numbersIn(text: string | undefined): NumberReference {
  if (!text) return { amounts: [], percents: [] };
  const percents = [...text.matchAll(PERCENT_RE)].map((m) => Number(m[1].replace(",", ".")));
  const amounts = findMoneyMentions(text)
    .filter((m) => Number.isFinite(m.value) && m.value >= 100)
    .map((m) => m.value);
  return { amounts, percents };
}

export function checkNumberConsistency(text: string, ref: NumberReference): ConsistencyResult {
  const flagged: FlaggedNumber[] = [];
  let checked = 0;

  const percentSpans: Array<[number, number]> = [];
  for (const m of text.matchAll(PERCENT_RE)) {
    const value = Number(m[1].replace(",", "."));
    percentSpans.push([m.index!, m.index! + m[0].length]);
    checked++;
    const ok = ref.percents.some((p) => Math.abs(Math.abs(value) - Math.abs(p)) <= PERCENT_TOLERANCE);
    if (!ok) flagged.push({ raw: m[0], value, kind: "percent", reason: "porcentaje que la app no calculó" });
  }

  for (const m of findMoneyMentions(text)) {
    if (percentSpans.some(([s, e]) => m.start < e && m.end > s)) continue;
    const yearLike = !m.marked && /^\d{4}$/.test(m.raw.trim()) && m.value >= 1950 && m.value <= 2099;
    if (!Number.isFinite(m.value) || m.value < 100 || yearLike) continue;
    checked++;
    const ok = ref.amounts.some((a) => a > 0 && Math.abs(m.value - a) / a <= AMOUNT_TOLERANCE);
    if (!ok) flagged.push({ raw: m.raw.trim(), value: m.value, kind: "amount", reason: "monto que no coincide con ningún dato calculado" });
  }

  return { ok: flagged.length === 0, checked, flagged };
}
