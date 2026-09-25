import { CLIENT_TIMEOUTS_MS, JSEARCH_CACHE_PREFIX, JSEARCH_CACHE_TTL_MS } from "@/config/constants";
import type { JSearchPayload } from "../router";
import type { StorageLike } from "../storage";
import type { SalaryBenchmark } from "../types";
import type { SalaryResponse } from "./contracts";
import { fetchWithPolicy, type PolicyOptions, type PolicyOutcome } from "./policy";

export const SALARY_ROUTE = "/api/salary";

interface CacheEntry {
  savedAt: number;
  benchmark: SalaryBenchmark;
}

export function cacheKey(p: JSearchPayload): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return `${JSEARCH_CACHE_PREFIX}${norm(p.jobTitle)}|${norm(p.location)}|${p.yearsBucket}`;
}

export function readCache(
  storage: StorageLike | null | undefined,
  p: JSearchPayload,
  now = Date.now(),
): CacheEntry | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(cacheKey(p));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.benchmark || typeof entry.savedAt !== "number") return null;
    if (now - entry.savedAt > JSEARCH_CACHE_TTL_MS) {
      storage.removeItem(cacheKey(p));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function writeCache(
  storage: StorageLike | null | undefined,
  p: JSearchPayload,
  benchmark: SalaryBenchmark,
  now = Date.now(),
): void {
  if (!storage) return;
  try {
    storage.setItem(cacheKey(p), JSON.stringify({ savedAt: now, benchmark } satisfies CacheEntry));
  } catch {
    /* quota exceeded / blocked storage: the cache is a convenience only */
  }
}

export interface SalaryResult {
  benchmark: SalaryBenchmark | null;
  source: "network" | "cache" | "none";
  outcome: PolicyOutcome<SalaryResponse> | null;
  cachedAt?: number;
}

/**
 * Market salary benchmark. Cache-first: the JSearch free tier is 200
 * requests/month, so a fresh (< 7 days) cached answer is used even online.
 */
export async function fetchSalaryBenchmark(
  payload: JSearchPayload,
  opts: Partial<PolicyOptions> & { baseUrl?: string; storage?: StorageLike | null } = {},
): Promise<SalaryResult> {
  const now = opts.now?.() ?? Date.now();
  const cached = readCache(opts.storage, payload, now);
  if (cached) return { benchmark: cached.benchmark, source: "cache", outcome: null, cachedAt: cached.savedAt };

  const outcome = await fetchWithPolicy<SalaryResponse>(
    `${opts.baseUrl ?? ""}${SALARY_ROUTE}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    { timeoutMs: CLIENT_TIMEOUTS_MS.jsearch, ...opts },
  );
  if (outcome.ok && outcome.data.benchmark) {
    writeCache(opts.storage, payload, outcome.data.benchmark, now);
    return { benchmark: outcome.data.benchmark, source: "network", outcome };
  }
  return { benchmark: null, source: "none", outcome };
}
