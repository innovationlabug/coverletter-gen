/**
 * fetchWithPolicy — the single place where timeouts, retries and error
 * classification live. Used by the three client API modules.
 *
 * - AbortController timeout per call (no retry after a timeout: if it was
 *   slow once, retrying only doubles the wait; we fall back instead).
 * - 1 retry with backoff on 429 / 5xx (except 504) / network error.
 * - A 504 from our own route means "upstream timed out" → treated as timeout.
 */
import { RETRY_POLICY } from "@/config/constants";

export type FailureKind = "timeout" | "http" | "network" | "offline";

export type PolicyOutcome<T> =
  | { ok: true; data: T; status: number; durationMs: number; attempts: number }
  | {
      ok: false;
      kind: FailureKind;
      status?: number;
      code?: string;
      message: string;
      durationMs: number;
      attempts: number;
    };

export interface PolicyOptions {
  timeoutMs: number;
  retries?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
  now?: () => number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function defaultIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status !== 504);
}

async function readError(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return { code: body?.error?.code, message: body?.error?.message };
  } catch {
    return {};
  }
}

export async function fetchWithPolicy<T>(
  url: string,
  init: RequestInit,
  opts: PolicyOptions,
): Promise<PolicyOutcome<T>> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const isOnline = opts.isOnline ?? defaultIsOnline;
  const now = opts.now ?? (() => Date.now());
  const retries = opts.retries ?? RETRY_POLICY.retries;
  const backoffMs = opts.backoffMs ?? RETRY_POLICY.backoffMs;
  const started = now();
  const elapsed = () => now() - started;

  if (!isOnline()) {
    return { ok: false, kind: "offline", message: "Sin conexión", durationMs: 0, attempts: 0 };
  }

  let attempt = 0;
  for (;;) {
    attempt++;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs);
    try {
      // Race against the abort so even a fetch that ignores the signal times out.
      const aborted = new Promise<never>((_, reject) =>
        controller.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
      );
      const res = await Promise.race([fetchImpl(url, { ...init, signal: controller.signal }), aborted]);
      if (res.ok) {
        try {
          const data = (await res.json()) as T;
          return { ok: true, data, status: res.status, durationMs: elapsed(), attempts: attempt };
        } catch {
          return {
            ok: false,
            kind: "http",
            status: res.status,
            code: "bad_response",
            message: "Respuesta inválida",
            durationMs: elapsed(),
            attempts: attempt,
          };
        }
      }
      if (res.status === 504) {
        const err = await readError(res);
        return {
          ok: false,
          kind: "timeout",
          status: 504,
          code: err.code ?? "upstream_timeout",
          message: err.message ?? "El servicio tardó demasiado",
          durationMs: elapsed(),
          attempts: attempt,
        };
      }
      if (isRetryableStatus(res.status) && attempt <= retries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait =
          res.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, RETRY_POLICY.maxRetryAfterMs)
            : backoffMs * attempt;
        clearTimeout(timer);
        await sleep(wait);
        continue;
      }
      const err = await readError(res);
      return {
        ok: false,
        kind: "http",
        status: res.status,
        code: err.code,
        message: err.message ?? `HTTP ${res.status}`,
        durationMs: elapsed(),
        attempts: attempt,
      };
    } catch (e) {
      if (timedOut) {
        return {
          ok: false,
          kind: "timeout",
          code: "client_timeout",
          message: `Sin respuesta en ${Math.round(opts.timeoutMs / 1000)} s`,
          durationMs: elapsed(),
          attempts: attempt,
        };
      }
      if (attempt <= retries && isOnline()) {
        clearTimeout(timer);
        await sleep(backoffMs * attempt);
        continue;
      }
      return {
        ok: false,
        kind: isOnline() ? "network" : "offline",
        message: e instanceof Error ? e.message : "Error de red",
        durationMs: elapsed(),
        attempts: attempt,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
