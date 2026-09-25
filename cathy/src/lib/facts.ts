import type { Language, Money, Profile, Seniority } from "./types";
import { GTQ_PER_USD, fromGTQ } from "./heuristics/currency";
import { salaryGap, type GapBand } from "./heuristics/gap";
import { extractSalaryRange, offerAsksExpectation, type SalaryRange } from "./heuristics/offer-salary";
import { whenToMention } from "./heuristics/timing";
import { detectLanguage } from "./heuristics/language";
import { detectSeniority } from "./heuristics/seniority";
import { numbersIn, type NumberReference } from "./heuristics/consistency";

/**
 * Todo lo que la app SABE (calculado de forma determinista) sobre la negociación.
 * Estos números son los únicos que se muestran; el LLM solo redacta alrededor de ellos.
 */
export interface NegotiationFacts {
  current: Money;
  desired: Money;
  currentGTQ: number;
  desiredGTQ: number;
  deltaGTQ: number;
  gapPct: number;
  band: GapBand;
  bandLabel: string;
  bandAdvice: string;
  offerRange: SalaryRange | null;
  desiredVsRange: "below" | "within" | "above" | null;
  /** % de lo deseado contra el tope del rango publicado (positivo = por encima). */
  pctVsRangeMax: number | null;
  timing: { id: string; moment: string; why: string };
  language: Language;
  seniority: Seniority;
  yearsExperience: number;
  gtqPerUsd: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeFacts(profile: Profile): NegotiationFacts {
  const gap = salaryGap(profile.currentSalary, profile.desiredSalary);
  const offerRange = extractSalaryRange(profile.jobOffer);
  let desiredVsRange: NegotiationFacts["desiredVsRange"] = null;
  let pctVsRangeMax: number | null = null;
  if (offerRange) {
    const lo = offerRange.minGTQMonthly ?? -Infinity;
    const hi = offerRange.maxGTQMonthly ?? Infinity;
    desiredVsRange = gap.desiredGTQ < lo ? "below" : gap.desiredGTQ > hi ? "above" : "within";
    if (offerRange.maxGTQMonthly) pctVsRangeMax = round1(((gap.desiredGTQ - offerRange.maxGTQMonthly) / offerRange.maxGTQMonthly) * 100);
  }
  const timing = whenToMention({
    hasOffer: Boolean(profile.jobOffer?.trim()),
    offerRange,
    asksExpectation: offerAsksExpectation(profile.jobOffer),
    desiredGTQ: gap.desiredGTQ,
    band: gap.band,
  });
  return {
    current: profile.currentSalary,
    desired: profile.desiredSalary,
    currentGTQ: Math.round(gap.currentGTQ),
    desiredGTQ: Math.round(gap.desiredGTQ),
    deltaGTQ: Math.round(gap.deltaGTQ),
    gapPct: gap.pct,
    band: gap.band,
    bandLabel: gap.rule.label,
    bandAdvice: gap.rule.advice,
    offerRange,
    desiredVsRange,
    pctVsRangeMax,
    timing: { id: timing.id, moment: timing.moment, why: timing.why },
    language: detectLanguage(profile.jobOffer),
    seniority: detectSeniority(profile.yearsExperience, profile.desiredRole, profile.jobOffer),
    yearsExperience: profile.yearsExperience,
    gtqPerUsd: GTQ_PER_USD,
  };
}

/**
 * Lista de números "legítimos" para el chequeo de consistencia del texto del modelo:
 * los calculados por la app + los que la persona escribió (logros, oferta), que el modelo
 * puede citar. Sin esto, "entregué 4 % bajo presupuesto" se marcaba como cifra inventada
 * (falso positivo encontrado en la primera corrida real del benchmark).
 */
export function numberReference(f: NegotiationFacts, sourceTexts: Array<string | undefined> = []): NumberReference {
  const amounts = new Set<number>();
  const add = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n) || n <= 0) return;
    amounts.add(n);
    amounts.add(Math.round(fromGTQ(n, "USD")));
  };
  add(f.current.amount);
  add(f.desired.amount);
  add(f.currentGTQ);
  add(f.desiredGTQ);
  add(Math.abs(f.deltaGTQ));
  add(f.offerRange?.min);
  add(f.offerRange?.max);
  add(f.offerRange?.minGTQMonthly);
  add(f.offerRange?.maxGTQMonthly);
  const percents = [f.gapPct];
  if (f.pctVsRangeMax !== null) percents.push(f.pctVsRangeMax);
  for (const t of sourceTexts) {
    const n = numbersIn(t);
    n.amounts.forEach((a) => amounts.add(a));
    percents.push(...n.percents);
  }
  return { amounts: [...amounts], percents };
}
