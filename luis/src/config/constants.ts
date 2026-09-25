/**
 * Single source of truth for tunable constants.
 *
 * FX rate: we deliberately use a fixed, documented local constant instead of an
 * FX API. The quetzal has been quasi-stable against the dollar for years
 * (~7.7–7.8 GTQ/USD), the negotiation note only needs an order-of-magnitude
 * comparison (bands of 10–30 %), and a live FX call would add one more network
 * dependency, one more failure mode and zero decision value. Update it by hand.
 */
export const FX_GTQ_PER_USD = 7.75;

/** Cloud model used by /api/letter. */
export const GEMINI_MODEL = "gemini-3.8-flash";

/** Client-side timeouts (ms) per API, measured from the browser. */
export const CLIENT_TIMEOUTS_MS = {
  tavily: 8_000,
  jsearch: 6_000,
  gemini: 20_000,
} as const;

/**
 * Upstream timeouts used inside the route handlers. Slightly lower than the
 * client ones so the route can answer with a clean 504 before the browser
 * aborts.
 */
export const UPSTREAM_TIMEOUTS_MS = {
  tavily: 7_000,
  jsearch: 5_000,
  gemini: 18_000,
} as const;

/** A successful call slower than this is reported as "lento". */
export const SLOW_THRESHOLD_MS = {
  tavily: 3_000,
  jsearch: 3_000,
  gemini: 10_000,
} as const;

/** Retry policy: 1 retry on 429 / 5xx (except 504) / network error. */
export const RETRY_POLICY = {
  retries: 1,
  backoffMs: 400,
  maxRetryAfterMs: 2_000,
} as const;

/** JSearch results are cached in localStorage for 7 days (free tier = 200 req/month). */
export const JSEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const JSEARCH_CACHE_PREFIX = "luis.jsearch.v1:";

/** Hours per month used to normalize HOUR salaries (40 h × 52 weeks / 12). */
export const HOURS_PER_MONTH = (40 * 52) / 12;
/** Working days per month used to normalize DAY salaries. */
export const DAYS_PER_MONTH = (5 * 52) / 12;
/** Weeks per month used to normalize WEEK salaries. */
export const WEEKS_PER_MONTH = 52 / 12;

/** Limits on free-text sent to the cloud (after redaction). */
export const MAX_ACHIEVEMENTS_CHARS = 2_000;
export const MAX_JOB_OFFER_CHARS = 4_000;
export const MAX_FACT_SNIPPET_CHARS = 350;

/** Placeholder the model must put where the signature goes; replaced locally. */
export const SIGNATURE_TOKEN = "[[FIRMA]]";
