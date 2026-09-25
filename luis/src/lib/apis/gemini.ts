import { CLIENT_TIMEOUTS_MS } from "@/config/constants";
import type { GeminiPayload } from "../router";
import type { LetterResponse } from "./contracts";
import { fetchWithPolicy, type PolicyOptions, type PolicyOutcome } from "./policy";

export const LETTER_ROUTE = "/api/letter";

/** Final letter via our /api/letter route (Gemini behind it). */
export async function fetchLetter(
  payload: GeminiPayload,
  opts: Partial<PolicyOptions> & { baseUrl?: string } = {},
): Promise<PolicyOutcome<LetterResponse>> {
  return fetchWithPolicy<LetterResponse>(
    `${opts.baseUrl ?? ""}${LETTER_ROUTE}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    { timeoutMs: CLIENT_TIMEOUTS_MS.gemini, ...opts },
  );
}
