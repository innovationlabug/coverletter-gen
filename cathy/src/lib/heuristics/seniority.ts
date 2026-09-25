import type { Seniority } from "../types";
import { fold } from "./fold";

/**
 * Seniority a partir de años + palabras clave del puesto/oferta.
 *
 * Por qué no necesita modelo: en el mercado guatemalteco los títulos usan un vocabulario
 * corto y estable (jr, trainee, sr, líder, jefe, gerente, head). Si hay palabra clave, manda
 * la palabra; si no, manda la tabla de años. Es explicable en una línea.
 */
const KEYWORDS: Array<{ level: Seniority; re: RegExp }> = [
  { level: "lead", re: /\b(lead|lider|jefe|jefa|gerente|head|manager|principal|director|directora|coordinador|coordinadora)\b/ },
  { level: "senior", re: /\b(sr|senior|señor|semi ?sr)\b/ },
  { level: "junior", re: /\b(jr|junior|trainee|practicante|pasante|intern|entry.level)\b/ },
];

export const YEARS_TABLE: Array<{ level: Seniority; minYears: number }> = [
  { level: "lead", minYears: 10 },
  { level: "senior", minYears: 5 },
  { level: "semi-senior", minYears: 2 },
  { level: "junior", minYears: 0 },
];

export function seniorityFromYears(years: number): Seniority {
  return YEARS_TABLE.find((r) => years >= r.minYears)?.level ?? "junior";
}

export function detectSeniority(years: number, ...texts: Array<string | undefined>): Seniority {
  const hay = fold(texts.filter(Boolean).join(" "));
  if (/\bsemi ?(sr|senior)\b/.test(hay)) return "semi-senior";
  for (const k of KEYWORDS) if (k.re.test(hay)) return k.level;
  return seniorityFromYears(years);
}
