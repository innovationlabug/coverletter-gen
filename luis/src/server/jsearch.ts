import { UPSTREAM_TIMEOUTS_MS } from "@/config/constants";
import type { SalaryRequest, SalaryResponse } from "@/lib/apis/contracts";
import type { SalaryBenchmark, SalaryPeriod } from "@/lib/types";
import { fetchUpstream, jsonError, mapUpstreamStatus } from "./http";

export const JSEARCH_URL = "https://api.openwebninja.com/jsearch/estimated-salary";

export function jsearchParams(req: SalaryRequest): Record<string, string> {
  return {
    job_title: req.jobTitle,
    location: req.location,
    location_type: "ANY",
    years_of_experience: req.yearsBucket,
  };
}

interface JSearchRow {
  location?: string;
  job_title?: string;
  publisher_name?: string;
  publisher_link?: string;
  min_salary?: number;
  max_salary?: number;
  median_salary?: number;
  salary_period?: string;
  salary_currency?: string;
  salary_count?: number;
  confidence?: string;
  salaries_updated_at?: string;
}

const PERIODS: SalaryPeriod[] = ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"];

export function normalizeRow(row: JSearchRow): SalaryBenchmark | null {
  const nums = [row.min_salary, row.median_salary, row.max_salary];
  if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0)) return null;
  const period = (row.salary_period ?? "YEAR").toUpperCase() as SalaryPeriod;
  return {
    jobTitle: row.job_title ?? "",
    location: row.location ?? "",
    minSalary: row.min_salary!,
    medianSalary: row.median_salary!,
    maxSalary: row.max_salary!,
    period: PERIODS.includes(period) ? period : "YEAR",
    currency: (row.salary_currency ?? "USD").toUpperCase(),
    publisher: row.publisher_name ?? null,
    publisherLink: row.publisher_link ?? null,
    confidence: row.confidence ?? null,
    salaryCount: typeof row.salary_count === "number" ? row.salary_count : null,
    updatedAt: row.salaries_updated_at ?? null,
  };
}

export async function callJSearch(req: SalaryRequest): Promise<Response> {
  const key = process.env.JSEARCH_API_KEY;
  if (!key) return jsonError(424, "not_configured", "JSEARCH_API_KEY no configurada");
  const params = jsearchParams(req);
  const url = `${JSEARCH_URL}?${new URLSearchParams(params).toString()}`;
  const r = await fetchUpstream(url, { headers: { "x-api-key": key } }, UPSTREAM_TIMEOUTS_MS.jsearch);
  if (!r.ok) {
    return r.timeout
      ? jsonError(504, "upstream_timeout", "JSearch tardó demasiado")
      : jsonError(502, "upstream_error", "No se pudo contactar a JSearch");
  }
  const text = await r.res.text().catch(() => "");
  if (!r.res.ok) return mapUpstreamStatus(r.res.status, text);
  let data: { status?: string; data?: JSearchRow[] } | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    return jsonError(502, "upstream_error", "Respuesta de JSearch no es JSON");
  }
  if (data?.status && data.status !== "OK") {
    return jsonError(424, "upstream_error", `JSearch respondió status=${data.status}`);
  }
  const rows = (data?.data ?? []).map(normalizeRow).filter((x): x is SalaryBenchmark => x !== null);
  // Prefer the row with the most reported salaries.
  rows.sort((a, b) => (b.salaryCount ?? 0) - (a.salaryCount ?? 0));
  const out: SalaryResponse = { benchmark: rows[0] ?? null, upstream: { url: JSEARCH_URL, params } };
  return Response.json(out);
}
