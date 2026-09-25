import type { CheckResult, CriterionId } from '../../src/lib/letter-checks';
import { SENSITIVE_TYPES, type SensitiveType } from '../../src/lib/types';
import type { JudgeResult } from './judge';
import type { LeakCaseResult } from './leaks';
import type { GeneratedLetter, Source } from './letters';

export const CRITERION_IDS: CriterionId[] = ['ajuste_oferta', 'cero_inventados', 'tono', 'longitud', 'espanol', 'cta'];
export const SOURCES: Source[] = ['local', 'nube', 'plantilla'];

/** gemini-3.8-flash, Gemini API / Vertex standard pricing, USD per 1M tokens (introductory until 2026-12-31). */
export const PRICING = { inputPerM: 0.75, outputPerM: 3.75, note: 'Precio introductorio hasta el 31-12-2026; desde el 1-1-2027: US$1.50 / US$7.50 por millón (entrada / salida con razonamiento).' };

export interface QualityCase {
  id: string;
  letters: Record<Source, GeneratedLetter>;
  checks: Partial<Record<Source, Record<CriterionId, CheckResult>>>;
  words: Partial<Record<Source, number>>;
  judge?: JudgeResult;
}

export interface LeakSummary {
  cases: number;
  canaries: number;
  blockedCases: number;
  sentCases: number;
  casesWithFinalLeak: number;
  byType: Record<SensitiveType, { total: number; atrapadosRedactor: number; atrapadosFinal: number; fugas: number; parciales: number }>;
  byDifficulty: Record<string, { total: number; atrapadosFinal: number }>;
  recallRedactor: number;
  recallFinal: number;
  falsePositives: number;
  allowedTotal: number;
  currentSalaryAnyFormLeaks: number;
  employerStructuralLeaks: number;
}

export function summarizeLeaks(cases: LeakCaseResult[]): LeakSummary {
  const byType = Object.fromEntries(
    SENSITIVE_TYPES.map((t) => [t, { total: 0, atrapadosRedactor: 0, atrapadosFinal: 0, fugas: 0, parciales: 0 }]),
  ) as LeakSummary['byType'];
  const byDifficulty: LeakSummary['byDifficulty'] = {};
  let canaries = 0;
  let cr = 0;
  let cf = 0;
  for (const c of cases) {
    for (const k of c.canaries) {
      canaries++;
      const t = byType[k.type];
      t.total++;
      if (k.redactor === 'atrapado') {
        t.atrapadosRedactor++;
        cr++;
      }
      if (k.final === 'atrapado') {
        t.atrapadosFinal++;
        cf++;
      } else if (k.final === 'fuga') t.fugas++;
      else t.parciales++;
      byDifficulty[k.dificultad] ??= { total: 0, atrapadosFinal: 0 };
      byDifficulty[k.dificultad].total++;
      if (k.final === 'atrapado') byDifficulty[k.dificultad].atrapadosFinal++;
    }
  }
  return {
    cases: cases.length,
    canaries,
    blockedCases: cases.filter((c) => c.blocked).length,
    sentCases: cases.filter((c) => !c.blocked).length,
    casesWithFinalLeak: cases.filter((c) => c.canaries.some((k) => k.final !== 'atrapado')).length,
    byType,
    byDifficulty,
    recallRedactor: canaries ? cr / canaries : 1,
    recallFinal: canaries ? cf / canaries : 1,
    falsePositives: cases.reduce((a, c) => a + c.falsePositives.length, 0),
    allowedTotal: cases.reduce((a, c) => a + c.allowedTotal, 0),
    currentSalaryAnyFormLeaks: cases.filter((c) => !c.blocked && c.currentSalaryInPayload).length,
    employerStructuralLeaks: cases.filter((c) => !c.blocked && c.employerInPayload).length,
  };
}

export interface QualitySummary {
  n: Record<Source, number>;
  deterministicPassRate: Record<Source, Record<CriterionId, number>>;
  deterministicOverall: Record<Source, number>;
  judgeMean: Record<Source, Record<CriterionId, number>>;
  judgeOverall: Record<Source, number>;
  /** Agreement between "deterministic pass" and "judge >= 4", per criterion (all sources pooled). */
  agreement: Record<CriterionId, { n: number; agree: number; pct: number; kappa: number }>;
  latencyMs: Record<Source, { mean: number; median: number; max: number }>;
  words: Record<Source, { mean: number; min: number; max: number }>;
  cloudTokens: { prompt: number; output: number; thoughts: number; costUSD: number; costPerLetterUSD: number };
  judgeTokens: { prompt: number; output: number; thoughts: number; costUSD: number };
  /** How often each source got each blind label (position-bias check). */
  labelCounts: Record<Source, Record<string, number>>;
  /** Mean judge overall per blind position, to detect position bias. */
  judgeByLabel: Record<string, number>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function kappa(pairs: [boolean, boolean][]): number {
  const n = pairs.length;
  if (!n) return NaN;
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const pa = pairs.filter(([a]) => a).length / n;
  const pb = pairs.filter(([, b]) => b).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

export function summarizeQuality(cases: QualityCase[]): QualitySummary {
  const init = <T>(f: () => T) => Object.fromEntries(SOURCES.map((s) => [s, f()])) as Record<Source, T>;
  const n = init(() => 0);
  const det = init(() => Object.fromEntries(CRITERION_IDS.map((c) => [c, [] as number[]])) as Record<CriterionId, number[]>);
  const jud = init(() => Object.fromEntries(CRITERION_IDS.map((c) => [c, [] as number[]])) as Record<CriterionId, number[]>);
  const lat = init(() => [] as number[]);
  const words = init(() => [] as number[]);
  const pairs = Object.fromEntries(CRITERION_IDS.map((c) => [c, [] as [boolean, boolean][]])) as Record<CriterionId, [boolean, boolean][]>;
  const labelCounts = init(() => ({}) as Record<string, number>);
  const byLabel: Record<string, number[]> = {};
  const cloudTok = { prompt: 0, output: 0, thoughts: 0 };
  const judgeTok = { prompt: 0, output: 0, thoughts: 0 };
  let cloudLetters = 0;

  for (const c of cases) {
    for (const s of SOURCES) {
      const l = c.letters[s];
      if (!l?.text) continue;
      n[s]++;
      if (l.latencyMs !== undefined && s !== 'plantilla') lat[s].push(l.latencyMs);
      if (c.words[s] !== undefined) words[s].push(c.words[s]!);
      const ch = c.checks[s];
      const js = c.judge?.bySource[s];
      for (const k of CRITERION_IDS) {
        if (ch) det[s][k].push(ch[k].pass ? 1 : 0);
        if (js) jud[s][k].push(js.scores[k]);
        if (ch && js) pairs[k].push([ch[k].pass, js.scores[k] >= 4]);
      }
      if (s === 'nube' && l.usage) {
        cloudLetters++;
        cloudTok.prompt += l.usage.promptTokens ?? 0;
        cloudTok.output += l.usage.outputTokens ?? 0;
        cloudTok.thoughts += l.usage.thoughtsTokens ?? 0;
      }
    }
    if (c.judge) {
      for (const [label, src] of Object.entries(c.judge.mapping)) labelCounts[src][label] = (labelCounts[src][label] ?? 0) + 1;
      for (const s of c.judge.byLabel) (byLabel[s.label] ??= []).push(mean(CRITERION_IDS.map((k) => s.scores[k])));
      judgeTok.prompt += c.judge.usage?.promptTokens ?? 0;
      judgeTok.output += c.judge.usage?.outputTokens ?? 0;
      judgeTok.thoughts += c.judge.usage?.thoughtsTokens ?? 0;
    }
  }
  const cost = (t: { prompt: number; output: number; thoughts: number }) =>
    (t.prompt / 1e6) * PRICING.inputPerM + ((t.output + t.thoughts) / 1e6) * PRICING.outputPerM;
  const cloudCost = cost(cloudTok);
  return {
    n,
    agreement: Object.fromEntries(
      CRITERION_IDS.map((k) => {
        const p = pairs[k];
        const agree = p.filter(([a, b]) => a === b).length;
        return [k, { n: p.length, agree, pct: p.length ? agree / p.length : NaN, kappa: kappa(p) }];
      }),
    ) as QualitySummary['agreement'],
    cloudTokens: { ...cloudTok, costUSD: cloudCost, costPerLetterUSD: cloudLetters ? cloudCost / cloudLetters : NaN },
    judgeTokens: { ...judgeTok, costUSD: cost(judgeTok) },
    labelCounts,
    judgeByLabel: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, mean(v)])),
    ...fill(),
  };

  function fill() {
    const deterministicPassRate = init(() => ({}) as Record<CriterionId, number>);
    const judgeMean = init(() => ({}) as Record<CriterionId, number>);
    const deterministicOverall = init(() => NaN);
    const judgeOverall = init(() => NaN);
    const latencyMs = init(() => ({ mean: NaN, median: NaN, max: NaN }));
    const w = init(() => ({ mean: NaN, min: NaN, max: NaN }));
    for (const s of SOURCES) {
      for (const k of CRITERION_IDS) {
        deterministicPassRate[s][k] = mean(det[s][k]);
        judgeMean[s][k] = mean(jud[s][k]);
      }
      deterministicOverall[s] = mean(CRITERION_IDS.flatMap((k) => det[s][k]));
      judgeOverall[s] = mean(CRITERION_IDS.flatMap((k) => jud[s][k]));
      latencyMs[s] = { mean: mean(lat[s]), median: median(lat[s]), max: lat[s].length ? Math.max(...lat[s]) : NaN };
      w[s] = { mean: mean(words[s]), min: words[s].length ? Math.min(...words[s]) : NaN, max: words[s].length ? Math.max(...words[s]) : NaN };
    }
    return { deterministicPassRate, judgeMean, deterministicOverall, judgeOverall, latencyMs, words: w };
  }
}
