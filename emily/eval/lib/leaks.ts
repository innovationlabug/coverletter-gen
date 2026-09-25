/**
 * Leak metrics: run the REAL router + redactor + gate for a fixture and measure, per canary,
 * whether it reached the would-be cloud payload.
 */
import { containsAmount, normalize } from '../../src/lib/money';
import { canonical } from '../../src/lib/redact';
import { buildCloudPayload } from '../../src/lib/router';
import type { SensitiveType } from '../../src/lib/types';
import type { Canary, Fixture } from './fixtures';

export type CanaryOutcome = 'atrapado' | 'fuga' | 'fuga_parcial';

export interface CanaryResult extends Canary {
  /** Result at the redactor level: is it in the payload that WOULD be sent? */
  redactor: CanaryOutcome;
  /** Result end-to-end: blocked payloads send nothing, so nothing leaks. */
  final: CanaryOutcome;
  /** What remained in the payload (for leaks). */
  evidencia?: string;
}

export interface LeakCaseResult {
  id: string;
  blocked: boolean;
  residual: { type: SensitiveType; match: string; rule: string }[];
  canaries: CanaryResult[];
  falsePositives: string[];
  allowedKept: number;
  allowedTotal: number;
  /** Structural check: current salary (any written form) anywhere in the payload. */
  currentSalaryInPayload: string | null;
  /** Structural check: declared employer (normalized) anywhere in the payload. */
  employerInPayload: boolean;
  redactionsCount: number;
  /** Redactions that do not overlap any canary (for manual inspection of false positives). */
  otherRedactions: { field: string; type: SensitiveType; match: string; rule: string }[];
  payload: string;
}

const STOP_TOKENS = new Set(
  'distribuidora banco grupo hospital colegio seguros farmacias cerveceria centro americana guatemala calle avenida zona colonia residenciales carretera salvador lopez'.split(
    ' ',
  ),
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Digits with separators between them removed: "+502 55 55 12 34" → "50255551234". */
function digitRuns(text: string): string {
  return text.replace(/(\d)[\s.\-/()+]+(?=\d)/g, '$1');
}

export function canaryOutcome(c: Canary, payload: string): { outcome: CanaryOutcome; evidencia?: string } {
  const hay = canonical(payload);
  const needle = canonical(c.value);
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(needle)}($|[^a-z0-9])`);
  if (re.test(hay)) return { outcome: 'fuga', evidencia: c.value };
  const digits = c.value.replace(/\D/g, '');
  if (digits.length >= 6 && digitRuns(payload).includes(digits)) return { outcome: 'fuga', evidencia: digits };
  if (c.type === 'person_name' || c.type === 'employer' || c.type === 'address') {
    const tokens = c.value
      .split(/[\s,.]+/)
      .filter((t) => t.length >= 4 && !STOP_TOKENS.has(normalize(t)) && !/^\d/.test(t));
    for (const t of tokens) {
      // case-sensitive: a capitalised surname surviving is a partial leak; the common word is not
      const tre = new RegExp(`(^|[^\\p{L}])${escapeRe(t)}($|[^\\p{L}])`, 'u');
      if (tre.test(payload)) return { outcome: 'fuga_parcial', evidencia: t };
    }
  }
  return { outcome: 'atrapado' };
}

export function evaluateLeaks(fx: Fixture): LeakCaseResult {
  const route = buildCloudPayload(fx.profile);
  const payload = `${route.prompt.system}\n${route.prompt.user}`;
  const canaries: CanaryResult[] = fx.canaries.map((c) => {
    const { outcome, evidencia } = canaryOutcome(c, payload);
    return { ...c, redactor: outcome, final: route.blocked ? 'atrapado' : outcome, evidencia };
  });
  const hay = canonical(payload);
  const falsePositives = fx.allowed.filter((a) => !hay.includes(canonical(a)));
  const canaryCanon = fx.canaries.map((c) => canonical(c.value));
  const otherRedactions = route.redactions
    .filter((r) => !canaryCanon.some((c) => c.includes(canonical(r.finding.match)) || canonical(r.finding.match).includes(c)))
    .map((r) => ({ field: r.field, type: r.finding.type, match: r.finding.match, rule: r.finding.rule }));
  const employerNorm = normalize(fx.profile.empleadorActual).replace(/\(.*?\)/g, '').replace(/,?\s*s\.\s?a\.?\s*$/, '').trim();
  return {
    id: fx.id,
    blocked: route.blocked,
    residual: route.residual.map((r) => ({ type: r.type, match: r.match, rule: r.rule })),
    canaries,
    falsePositives,
    allowedKept: fx.allowed.length - falsePositives.length,
    allowedTotal: fx.allowed.length,
    currentSalaryInPayload: containsAmount(payload, fx.profile.salarioActual),
    employerInPayload: normalize(payload).includes(employerNorm),
    redactionsCount: route.redactions.length,
    otherRedactions,
    payload,
  };
}
