export type Currency = "GTQ" | "USD";

/** Everything the user types in the form. Lives only in the browser. */
export interface Profile {
  /** User's name — used only locally for the signature. Never sent. */
  name: string;
  currentRole: string;
  /** SENSITIVE — never sent anywhere. */
  currentEmployer: string;
  /** SENSITIVE — monthly amount, never leaves the device. */
  currentSalary: number;
  currentCurrency: Currency;
  desiredRole: string;
  targetCompany: string;
  /** City / country, e.g. "Ciudad de Guatemala, Guatemala". */
  location: string;
  /** SENSITIVE — monthly amount, never sent (the letter mentions no numbers). */
  desiredSalary: number;
  desiredCurrency: Currency;
  yearsExperience: number;
  /** Free text, may contain sensitive data → redacted before leaving. */
  achievements: string;
  /** Optional pasted job offer → redacted before leaving. */
  jobOffer: string;
}

export type Destination = "gemini" | "tavily" | "jsearch";

/** A company fact returned by Tavily (via /api/company). */
export interface CompanyFact {
  id: number;
  title: string;
  url: string;
  snippet: string;
}

export type SalaryPeriod = "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR";

/** Normalized JSearch estimated-salary row. */
export interface SalaryBenchmark {
  jobTitle: string;
  location: string;
  minSalary: number;
  medianSalary: number;
  maxSalary: number;
  period: SalaryPeriod;
  currency: string;
  publisher: string | null;
  publisherLink: string | null;
  confidence: string | null;
  salaryCount: number | null;
  updatedAt: string | null;
}

export type ApiStatus =
  | "idle"
  | "loading"
  | "ok"
  | "slow"
  | "timeout"
  | "failed"
  | "offline"
  | "cached"
  | "blocked";

export interface ApiStatusInfo {
  status: ApiStatus;
  detail?: string;
  durationMs?: number;
  attempts?: number;
}

/** One request body that left the browser (kept for tests and debugging; not rendered). */
export interface OutgoingRecord {
  destination: Destination;
  /** Route in our app that the browser called. */
  route: string;
  /** Exact JSON body the browser sent. */
  body: unknown;
  /** What the route says it forwarded upstream (echoed back, never the key). */
  upstream?: unknown;
  blocked?: boolean;
  blockedReason?: string;
  at: string;
}
