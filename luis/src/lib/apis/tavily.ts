import { CLIENT_TIMEOUTS_MS } from "@/config/constants";
import type { TavilyPayload } from "../router";
import type { CompanyFact } from "../types";
import type { CompanyResponse } from "./contracts";
import { fetchWithPolicy, type PolicyOptions, type PolicyOutcome } from "./policy";

export const COMPANY_ROUTE = "/api/company";

export interface CompanyResult {
  outcome: PolicyOutcome<CompanyResponse>;
  facts: CompanyFact[];
}

/** Company research via our /api/company route (Tavily behind it). */
export async function fetchCompanyFacts(
  payload: TavilyPayload,
  opts: Partial<PolicyOptions> & { baseUrl?: string } = {},
): Promise<CompanyResult> {
  const outcome = await fetchWithPolicy<CompanyResponse>(
    `${opts.baseUrl ?? ""}${COMPANY_ROUTE}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    { timeoutMs: CLIENT_TIMEOUTS_MS.tavily, ...opts },
  );
  return { outcome, facts: outcome.ok ? outcome.data.facts : [] };
}
