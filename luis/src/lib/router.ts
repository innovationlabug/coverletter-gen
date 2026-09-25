/**
 * Explicit router: decides — in code, not in a prompt — which fields of the
 * profile may travel to each cloud destination.
 *
 * Flow for every destination:
 *   1. pick ONLY the allowlisted fields (everything else is never read)
 *   2. redact free text (achievements, job offer, Tavily snippets)
 *   3. verify the object has exactly the allowlisted keys
 *   4. run the deterministic validator over every string in the payload;
 *      if anything sensitive survived → throw `SensitiveDataError` (the send
 *      is blocked, never "sent anyway").
 */
import {
  MAX_ACHIEVEMENTS_CHARS,
  MAX_FACT_SNIPPET_CHARS,
  MAX_JOB_OFFER_CHARS,
} from "@/config/constants";
import {
  assertPayloadClean,
  contextFromProfile,
  redactText,
  SensitiveDataError,
  type FindingKind,
} from "./redact";
import type { CompanyFact, Destination, Profile } from "./types";

export type YearsBucket =
  | "LESS_THAN_ONE"
  | "ONE_TO_THREE"
  | "FOUR_TO_SIX"
  | "SEVEN_TO_NINE"
  | "TEN_TO_FOURTEEN"
  | "ABOVE_FIFTEEN";

export const YEARS_BUCKETS: readonly YearsBucket[] = [
  "LESS_THAN_ONE",
  "ONE_TO_THREE",
  "FOUR_TO_SIX",
  "SEVEN_TO_NINE",
  "TEN_TO_FOURTEEN",
  "ABOVE_FIFTEEN",
];

/** Map years of experience to the JSearch enum. */
export function yearsToBucket(years: number): YearsBucket {
  if (years < 1) return "LESS_THAN_ONE";
  if (years <= 3) return "ONE_TO_THREE";
  if (years <= 6) return "FOUR_TO_SIX";
  if (years <= 9) return "SEVEN_TO_NINE";
  if (years <= 14) return "TEN_TO_FOURTEEN";
  return "ABOVE_FIFTEEN";
}

export interface TavilyPayload {
  company: string;
  role: string;
}

export interface JSearchPayload {
  jobTitle: string;
  location: string;
  yearsBucket: YearsBucket;
}

export interface GeminiFact {
  id: number;
  title: string;
  snippet: string;
}

export interface GeminiPayload {
  desiredRole: string;
  targetCompany: string;
  yearsExperience: number;
  achievements: string;
  jobOffer: string;
  companyFacts: GeminiFact[];
}

export interface PayloadByDestination {
  tavily: TavilyPayload;
  jsearch: JSearchPayload;
  gemini: GeminiPayload;
}

/** The allowlist, as data, so tests and the README can read it. */
export const ALLOWLIST: { [D in Destination]: readonly (keyof PayloadByDestination[D])[] } = {
  tavily: ["company", "role"],
  jsearch: ["jobTitle", "location", "yearsBucket"],
  gemini: [
    "desiredRole",
    "targetCompany",
    "yearsExperience",
    "achievements",
    "jobOffer",
    "companyFacts",
  ],
};

/** Profile fields that are never read by any destination builder. */
export const NEVER_SENT: readonly (keyof Profile)[] = [
  "name",
  "currentEmployer",
  "currentSalary",
  "currentCurrency",
  "desiredSalary",
  "desiredCurrency",
  "currentRole",
];

export interface Redaction {
  field: string;
  kind: FindingKind;
}

export interface BuiltPayload<D extends Destination> {
  destination: D;
  payload: PayloadByDestination[D];
  /** What the redactor replaced (kinds only — never the values). */
  redactions: Redaction[];
}

export interface BuildOptions {
  /** Tavily facts to pass to Gemini (third-party text → also redacted). */
  facts?: CompanyFact[];
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);
const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export function buildCloudPayload<D extends Destination>(
  profile: Profile,
  destination: D,
  options: BuildOptions = {},
): BuiltPayload<D> {
  const ctx = contextFromProfile(profile);
  const redactions: Redaction[] = [];
  const redact = (field: string, text: string) => {
    const r = redactText(text, ctx);
    for (const f of r.findings) redactions.push({ field, kind: f.kind });
    return r.text;
  };

  let payload: PayloadByDestination[Destination];
  switch (destination) {
    case "tavily":
      payload = {
        company: clean(profile.targetCompany),
        role: clean(profile.desiredRole),
      } satisfies TavilyPayload;
      break;
    case "jsearch":
      payload = {
        jobTitle: clean(profile.desiredRole),
        location: clean(profile.location),
        yearsBucket: yearsToBucket(profile.yearsExperience),
      } satisfies JSearchPayload;
      break;
    case "gemini":
      payload = {
        desiredRole: clean(profile.desiredRole),
        targetCompany: clean(profile.targetCompany),
        yearsExperience: Math.max(0, Math.round(profile.yearsExperience)),
        achievements: clip(redact("achievements", profile.achievements.trim()), MAX_ACHIEVEMENTS_CHARS),
        jobOffer: clip(redact("jobOffer", (profile.jobOffer ?? "").trim()), MAX_JOB_OFFER_CHARS),
        companyFacts: (options.facts ?? []).slice(0, 3).map((f) => ({
          id: f.id,
          title: redact(`companyFacts[${f.id}].title`, clean(f.title)),
          snippet: clip(redact(`companyFacts[${f.id}].snippet`, clean(f.snippet)), MAX_FACT_SNIPPET_CHARS),
        })),
      } satisfies GeminiPayload;
      break;
    default:
      throw new Error(`Destino desconocido: ${String(destination)}`);
  }

  // Exact-key check: the object must have exactly the allowlisted keys.
  const allowed = new Set<string>(ALLOWLIST[destination] as readonly string[]);
  const keys = Object.keys(payload);
  const extra = keys.filter((k) => !allowed.has(k));
  if (extra.length || keys.length !== allowed.size) {
    throw new Error(`Payload para ${destination} no respeta la allowlist: ${extra.join(", ")}`);
  }

  // Final gate: nothing sensitive may remain in any string of the payload.
  assertPayloadClean(payload, ctx);

  return { destination, payload: payload as PayloadByDestination[D], redactions };
}

export { SensitiveDataError };
