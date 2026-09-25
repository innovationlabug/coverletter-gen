/**
 * The ONLY place that decides what goes to the cloud.
 *
 * 1. Allowlist: only the fields in CLOUD_ALLOWLIST are considered at all. Salaries, currencies,
 *    current employer and the user's name are never copied (the name travels as a placeholder
 *    and is restored locally when the letter comes back).
 * 2. Redaction: every allowlisted free-text field goes through the deterministic redactor.
 * 3. Gate: the final prompt string (the exact bytes that would be sent) is scanned again with the
 *    redactor + the known sensitive values of this profile (current/desired salary in every
 *    written form, employer). Any residual ⇒ blocked = true and nothing is sent.
 */
import { amountVariants, containsAmount, normalize } from './money';
import { buildLetterPrompt, type LetterInput, type LetterPrompt } from './prompt';
import { buildEmployerMatcher, findSensitive, NAME_PLACEHOLDER, redact, type RedactContext } from './redact';
import type { Finding, Profile } from './types';

/** Fields that may reach the cloud (after redaction). Everything else stays on the device. */
export const CLOUD_ALLOWLIST = [
  'puestoActual',
  'aniosExperiencia',
  'puestoDeseado',
  'empresaDestino',
  'logros',
  'oferta',
] as const satisfies readonly (keyof Profile)[];

/** Fields that never leave the device, with the reason shown in the UI. */
export const LOCAL_ONLY_FIELDS: Record<string, string> = {
  salarioActual: 'Salario actual: nunca sale del dispositivo (regla del proyecto).',
  monedaActual: 'Moneda del salario actual: solo la usa la nota local.',
  salarioDeseado: 'Salario deseado: la carta no debe mencionarlo; solo lo usa la nota local.',
  monedaDeseada: 'Moneda deseada: solo la usa la nota local.',
  empleadorActual: 'Empleador actual: sensible; se omite y se redacta donde aparezca.',
  nombre: `Nombre: viaja como ${NAME_PLACEHOLDER} y se reemplaza localmente al recibir la carta.`,
};

export type AllowedField = (typeof CLOUD_ALLOWLIST)[number];

export interface CloudPayload {
  firma: typeof NAME_PLACEHOLDER;
  puestoActual: string;
  aniosExperiencia: number;
  puestoDeseado: string;
  empresaDestino: string;
  logros: string;
  oferta?: string;
}

export interface RouteDecision {
  payload: CloudPayload;
  /** The exact prompt that would be sent. */
  prompt: LetterPrompt;
  /** Redactions applied, per field. */
  redactions: { field: AllowedField; finding: Finding }[];
  /** Anything sensitive still present in the final prompt. Non-empty ⇒ blocked. */
  residual: Finding[];
  blocked: boolean;
  excludedFields: string[];
}

export function redactContext(profile: Profile): RedactContext {
  return {
    employer: profile.empleadorActual,
    ownNames: profile.nombre ? [profile.nombre] : [],
    keep: [profile.empresaDestino, profile.puestoDeseado].filter(Boolean),
  };
}

/**
 * Scan an outgoing string for anything sensitive about this profile.
 * Used as the final gate and by tests/eval.
 */
export function detectResidual(text: string, profile: Profile): Finding[] {
  const residual: Finding[] = findSensitive(text, redactContext(profile)).filter((f) => f.rule !== 'own_name');
  // Known values of THIS profile, in every written form, even if the generic rules missed them.
  for (const [amount, label] of [
    [profile.salarioActual, 'known_current_salary'],
    [profile.salarioDeseado, 'known_desired_salary'],
  ] as const) {
    const hit = containsAmount(text, amount);
    if (hit) residual.push({ type: 'salary', match: hit, index: -1, rule: label });
  }
  const matcher = buildEmployerMatcher(profile.empleadorActual);
  if (matcher) {
    const compactText = normalize(text).replace(/[^a-z0-9]/g, '');
    const compactName = matcher.full.replace(/[^a-z0-9]/g, '');
    if (compactName.length >= 4 && compactText.includes(compactName)) {
      residual.push({ type: 'employer', match: matcher.full, index: -1, rule: 'known_employer' });
    }
  }
  return residual;
}

export function buildCloudPayload(profile: Profile): RouteDecision {
  const ctx = redactContext(profile);
  const redactions: RouteDecision['redactions'] = [];
  const clean = (field: AllowedField, value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const r = redact(value, ctx);
    for (const finding of r.findings) redactions.push({ field, finding });
    return r.text;
  };

  const payload: CloudPayload = {
    firma: NAME_PLACEHOLDER,
    puestoActual: clean('puestoActual', profile.puestoActual) ?? '',
    aniosExperiencia: Number.isFinite(profile.aniosExperiencia) ? Math.max(0, Math.round(profile.aniosExperiencia)) : 0,
    puestoDeseado: clean('puestoDeseado', profile.puestoDeseado) ?? '',
    empresaDestino: clean('empresaDestino', profile.empresaDestino) ?? '',
    logros: clean('logros', profile.logros) ?? '',
    oferta: profile.oferta?.trim() ? clean('oferta', profile.oferta) : undefined,
  };

  const input: LetterInput = { ...payload };
  const prompt = buildLetterPrompt(input);
  const residual = detectResidual(`${prompt.system}\n${prompt.user}`, profile);

  return {
    payload,
    prompt,
    redactions,
    residual,
    blocked: residual.length > 0,
    excludedFields: Object.keys(LOCAL_ONLY_FIELDS),
  };
}

/** Exposed for the "qué salió a la nube" panel. */
export function salaryFormsForDisplay(amount: number): string[] {
  return amountVariants(amount);
}
