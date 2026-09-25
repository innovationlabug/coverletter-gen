import type { Currency, Language } from "../types";
import { findMoneyMentions, type MoneyMention } from "./money";
import { toGTQ } from "./currency";
import { detectLanguage } from "./language";

/**
 * Rango salarial publicado en la oferta, por regex.
 *
 * Por qué no necesita modelo: cuando una oferta publica salario lo hace con un patrón muy
 * repetido — "Q8,000 - Q10,000", "entre Q8,000 y Q10,000", "hasta Q15,000", "$1,500–2,000
 * USD", "8k-10k", "US$36,000/year". Detectar dos montos unidos por un conector, o un monto
 * cerca de "salario/sueldo/salary", es exacto y verificable. Si no hay patrón, devolvemos
 * null (honesto) en lugar de "estimar" un rango.
 */

export type Period = "month" | "year";

export interface SalaryRange {
  min: number | null;
  max: number | null;
  currency: Currency;
  period: Period;
  /** Rango normalizado a GTQ mensuales (en GT un salario anual = 14 sueldos: 12 + aguinaldo + bono 14). */
  minGTQMonthly: number | null;
  maxGTQMonthly: number | null;
  raw: string;
}

const CONNECTOR_RE = /^\s*(?:-|–|—|a|y|to|and|hasta)\s*$/i;
const KEYWORD_RE = /(salario|sueldo|salary|compensaci[oó]n|compensation|pay|ofrecemos|we offer|rango|range|hasta|up to|base)/i;
const YEAR_RE = /(anual|al año|por año|annual|per year|a year|\/year|\/yr|yearly|annually)/i;
const BONUS_RE = /(bono|bonos|bonificaci[oó]n|aguinaldo|annual bonus|bonus)\s*(anual(es)?|per year|yearly)?/gi;
const UPTO_RE = /(hasta|up to)\s*$/i;

/** Anual → mensual. GTQ: /14 (12 sueldos + aguinaldo + bono 14, Decreto 76-78 y 42-92). USD: /12. */
export function annualToMonthly(amount: number, currency: Currency): number {
  return currency === "GTQ" ? amount / 14 : amount / 12;
}

function inferCurrency(mentions: MoneyMention[], lang: Language): Currency {
  const explicit = mentions.find((m) => m.currency)?.currency;
  if (explicit) return explicit;
  return lang === "en" ? "USD" : "GTQ";
}

export function extractSalaryRange(offer: string | undefined): SalaryRange | null {
  if (!offer) return null;
  const lang = detectLanguage(offer);
  const all = findMoneyMentions(offer);
  const money = all.filter((m) => m.isMoney);
  if (money.length === 0) return null;

  let min: number | null = null;
  let max: number | null = null;
  let used: MoneyMention[] = [];

  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i];
    const b = all[i + 1];
    if (!b.isMoney || !CONNECTOR_RE.test(offer.slice(a.end, b.start))) continue;
    // "8-10k": el multiplicador del segundo aplica al primero.
    const sharesMultiplier = !a.isMoney && a.value < 1000 && /(k|mil)\s*\S*$/i.test(b.raw);
    if (!a.isMoney && !sharesMultiplier) continue;
    const aValue = sharesMultiplier ? a.value * 1000 : a.value;
    if (b.value < aValue) continue;
    min = aValue;
    max = b.value;
    used = [a, b];
    break;
  }

  if (used.length === 0) {
    const near = money.find((m) => KEYWORD_RE.test(offer.slice(Math.max(0, m.start - 60), m.start)));
    if (!near) return null;
    used = [near];
    if (UPTO_RE.test(offer.slice(Math.max(0, near.start - 12), near.start))) max = near.value;
    else {
      min = near.value;
      max = near.value;
    }
  }

  const currency = inferCurrency(used, lang);
  const context = offer.slice(Math.max(0, used[0].start - 30), Math.min(offer.length, used[used.length - 1].end + 40));
  // "bono anual" no convierte el salario en anual (caso real que rompió la primera versión).
  const period: Period = YEAR_RE.test(context.replace(BONUS_RE, "")) ? "year" : "month";
  const toMonthlyGTQ = (v: number | null) => {
    if (v === null) return null;
    const monthly = period === "year" ? annualToMonthly(v, currency) : v;
    return Math.round(toGTQ(monthly, currency));
  };
  return {
    min,
    max,
    currency,
    period,
    minGTQMonthly: toMonthlyGTQ(min),
    maxGTQMonthly: toMonthlyGTQ(max),
    raw: offer.slice(used[0].start, used[used.length - 1].end),
  };
}

/** ¿La oferta pide explícitamente la pretensión salarial? */
export function offerAsksExpectation(offer: string | undefined): boolean {
  if (!offer) return false;
  return /(pretensi[oó]n salarial|expectativa salarial|salario (deseado|pretendido)|indi(ca|que) (tu|su) (salario|pretensi)|salary expectations?|desired salary|expected salary)/i.test(offer);
}
