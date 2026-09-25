import { MAX_FACT_SNIPPET_CHARS, UPSTREAM_TIMEOUTS_MS } from "@/config/constants";
import type { CompanyRequest, CompanyResponse } from "@/lib/apis/contracts";
import type { CompanyFact } from "@/lib/types";
import { fetchUpstream, jsonError, mapUpstreamStatus } from "./http";

export const TAVILY_URL = "https://api.tavily.com/search";

/** The only place where the Tavily query string is composed (company + role only). */
export function tavilyBody(req: CompanyRequest) {
  return {
    query: `${req.company}: qué hace la empresa, productos, cultura y noticias recientes (contexto: puesto de ${req.role})`,
    max_results: 3,
    search_depth: "basic" as const,
  };
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

export async function callTavily(req: CompanyRequest): Promise<Response> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return jsonError(424, "not_configured", "TAVILY_API_KEY no configurada");
  const body = tavilyBody(req);
  const r = await fetchUpstream(
    TAVILY_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    },
    UPSTREAM_TIMEOUTS_MS.tavily,
  );
  if (!r.ok) {
    return r.timeout
      ? jsonError(504, "upstream_timeout", "Tavily tardó demasiado")
      : jsonError(502, "upstream_error", "No se pudo contactar a Tavily");
  }
  if (!r.res.ok) return mapUpstreamStatus(r.res.status, await r.res.text().catch(() => ""));
  const data = (await r.res.json().catch(() => null)) as { results?: TavilyResult[] } | null;
  const facts: CompanyFact[] = (data?.results ?? [])
    .filter((x) => x.url && (x.title || x.content))
    .slice(0, 3)
    .map((x, i) => ({
      id: i + 1,
      title: (x.title ?? "").trim().slice(0, 200),
      url: x.url!,
      snippet: (x.content ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FACT_SNIPPET_CHARS),
    }));
  const out: CompanyResponse = { facts, upstream: { url: TAVILY_URL, body } };
  return Response.json(out);
}
