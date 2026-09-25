import type { Profile } from "./types";
import { LetterPayloadSchema, type LetterPayload } from "./schemas";
import { redact, type Finding, type RedactionContext } from "./heuristics/redactor";
import { toGTQ } from "./heuristics/currency";
import { detectLanguage } from "./heuristics/language";
import { detectSeniority } from "./heuristics/seniority";

/**
 * Router de datos por tier. Esta es la ÚNICA puerta por la que un dato sale del navegador.
 * Las listas son explícitas (allowlist, no denylist): un campo nuevo en el perfil no
 * viaja a ningún lado hasta que alguien lo agregue aquí a propósito, y la prueba lo nota.
 *
 *   tier 0 · device       → navegador: todo.
 *   tier 1 · private      → Ollama en Cloud Run del mismo dueño (IAM): perfil completo,
 *                            incluido el salario actual. Decisión documentada en docs/decisiones.md.
 *   tier 2 · third_party  → Gemini (Vertex AI): solo campos de la carta, redactados.
 */
export type Tier = "device" | "private" | "third_party";

export const PROFILE_FIELDS = [
  "fullName",
  "email",
  "phone",
  "currentRole",
  "currentEmployer",
  "currentSalary",
  "desiredRole",
  "desiredSalary",
  "targetCompany",
  "yearsExperience",
  "achievements",
  "jobOffer",
] as const satisfies ReadonlyArray<keyof Profile>;

export const TIER_ALLOWLIST: Record<Tier, ReadonlyArray<keyof Profile>> = {
  device: PROFILE_FIELDS,
  private: PROFILE_FIELDS,
  third_party: ["fullName", "desiredRole", "targetCompany", "yearsExperience", "achievements"],
};

/** Campos derivados (no del perfil) que también viajan al tier 2. Ninguno es sensible. */
export const THIRD_PARTY_DERIVED = ["requirements", "language", "seniority"] as const;

/** Campos de texto libre del tier 2 que SIEMPRE pasan por el redactor. */
export const THIRD_PARTY_FREE_TEXT = ["fullName", "desiredRole", "targetCompany", "achievements"] as const;

export interface ThirdPartyExtras {
  requirements?: string[];
}

export interface PrivatePayload {
  profile: Profile;
}

export function redactionContextFor(profile: Profile): RedactionContext {
  const amounts = [profile.currentSalary, profile.desiredSalary].flatMap((m) => [m.amount, Math.round(toGTQ(m.amount, m.currency))]);
  return { employer: profile.currentEmployer, knownAmounts: amounts };
}

function pick<T extends object, K extends keyof T>(obj: T, keys: ReadonlyArray<K>): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function buildPayload(profile: Profile, tier: "device"): Profile;
export function buildPayload(profile: Profile, tier: "private"): PrivatePayload;
export function buildPayload(profile: Profile, tier: "third_party", extras?: ThirdPartyExtras): LetterPayload;
export function buildPayload(profile: Profile, tier: Tier, extras: ThirdPartyExtras = {}): Profile | PrivatePayload | LetterPayload {
  if (tier === "device") return { ...pick(profile, TIER_ALLOWLIST.device) } as Profile;
  if (tier === "private") return { profile: pick(profile, TIER_ALLOWLIST.private) as Profile };
  return buildThirdParty(profile, extras).payload;
}

export function buildThirdParty(profile: Profile, extras: ThirdPartyExtras = {}): { payload: LetterPayload; findings: Finding[] } {
  const ctx = redactionContextFor(profile);
  const findings: Finding[] = [];
  // El nombre de la persona solo pasa por los detectores de contacto/montos, no por los del
  // empleador (si alguien se apellida igual que su empresa, no queremos borrarle el nombre).
  const clean = (s: string, c: RedactionContext = ctx) => {
    const r = redact(s, c, { currencyWords: true });
    findings.push(...r.findings);
    return r.text;
  };
  const base = pick(profile, TIER_ALLOWLIST.third_party);
  const payload: LetterPayload = {
    fullName: clean(base.fullName, { knownAmounts: ctx.knownAmounts }),
    desiredRole: clean(base.desiredRole),
    targetCompany: clean(base.targetCompany),
    yearsExperience: base.yearsExperience,
    achievements: clean(base.achievements ?? ""),
    requirements: (extras.requirements ?? []).slice(0, 15).map((r) => clean(r).slice(0, 240)),
    language: detectLanguage(profile.jobOffer),
    seniority: detectSeniority(profile.yearsExperience, profile.desiredRole, profile.jobOffer),
  };
  // strict(): si alguien agrega un campo arriba sin actualizar el esquema, esto revienta.
  return { payload: LetterPayloadSchema.parse(payload), findings };
}
