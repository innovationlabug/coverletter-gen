/** Small helpers shared by the three route handlers (server-only). */
import type { z } from "zod";
import { assertPayloadClean, SensitiveDataError } from "@/lib/redact";

export function jsonError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * Reject cross-site browser calls (cheap abuse guard for a public deploy).
 * Requests without an Origin header (curl, server-to-server, tests) pass.
 */
export function checkOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    /* fallthrough */
  }
  return jsonError(403, "forbidden_origin", "Origen no permitido");
}

/**
 * Parse + validate the body with a strict zod schema, then run the generic
 * sensitive-data scan (emails, phones, DPI, NIT, money). The server does not
 * know the user's salary or employer — those checks live in the browser — but
 * it can still refuse anything that looks like money or an identifier.
 */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError(400, "invalid_request", "JSON inválido") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
    return { ok: false, response: jsonError(400, "invalid_request", issues) };
  }
  try {
    assertPayloadClean(parsed.data);
  } catch (e) {
    if (e instanceof SensitiveDataError) {
      const kinds = [...new Set(e.findings.map((f) => f.kind))].join(", ");
      return {
        ok: false,
        response: jsonError(422, "sensitive_data", `Datos sensibles detectados (${kinds}) en ${e.field}`),
      };
    }
    throw e;
  }
  return { ok: true, data: parsed.data };
}

/** fetch with an AbortController timeout (server → upstream). */
export async function fetchUpstream(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: true; res: Response } | { ok: false; timeout: boolean; error: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    return { ok: true, res };
  } catch (error) {
    return { ok: false, timeout: controller.signal.aborted, error };
  } finally {
    clearTimeout(timer);
  }
}

/** Map an upstream HTTP failure to our route's status + code. */
export function mapUpstreamStatus(status: number, bodyText: string): Response {
  if (status === 429) return jsonError(429, "rate_limited", "Límite de uso del proveedor alcanzado");
  if (status === 401) return jsonError(424, "upstream_auth", "Credencial rechazada por el proveedor");
  if (status === 403) {
    const notSubscribed = /not subscribed/i.test(bodyText);
    return jsonError(
      424,
      notSubscribed ? "not_subscribed" : "upstream_auth",
      notSubscribed ? "La API key no está suscrita a esta API" : "Acceso denegado por el proveedor",
    );
  }
  if (status >= 500) return jsonError(502, "upstream_error", `El proveedor respondió ${status}`);
  return jsonError(424, "upstream_error", `El proveedor respondió ${status}`);
}
