import { vi } from "vitest";
import { POST as companyPOST } from "@/app/api/company/route";
import { POST as letterPOST } from "@/app/api/letter/route";
import { POST as salaryPOST } from "@/app/api/salary/route";

export interface CapturedRequest {
  hop: "browser→route" | "route→upstream";
  url: string;
  method: string;
  body: string;
}

export const TAVILY_OK = {
  query: "x",
  results: [
    { title: "Tigo Guatemala lanza red 5G", url: "https://example.com/tigo-5g", content: "Tigo anunció la expansión de su red 5G en 2025.", score: 0.9 },
    { title: "Tigo y la inclusión digital", url: "https://example.com/tigo-inclusion", content: "Programa de becas para jóvenes programadores.", score: 0.8 },
  ],
  response_time: 1.2,
};

export const JSEARCH_OK = {
  status: "OK",
  data: [
    {
      location: "Guatemala",
      job_title: "Software Engineer",
      min_salary: 11625,
      max_salary: 22333.33,
      median_salary: 17666.67,
      salary_period: "MONTH",
      salary_currency: "GTQ",
      salary_count: 59,
      salaries_updated_at: "2026-08-20T08:25:12.000Z",
      publisher_name: "Glassdoor",
      publisher_link: "https://example.com/glassdoor",
      confidence: "VERY_HIGH",
    },
  ],
};

export function geminiOk(carta = "Estimado equipo de selección:\n\nMe interesa el puesto.\n\nAtentamente,\n[[FIRMA]]", used = [1]) {
  return {
    candidates: [
      {
        content: { role: "model", parts: [{ text: JSON.stringify({ carta, hechos_usados: used }) }] },
        finishReason: "STOP",
      },
    ],
  };
}

const ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  "/api/company": companyPOST,
  "/api/salary": salaryPOST,
  "/api/letter": letterPOST,
};

function toText(body: BodyInit | null | undefined): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) return new TextDecoder().decode(body as ArrayBuffer);
  return String(body);
}

/**
 * Installs a global fetch mock that:
 *  - dispatches /api/* to the REAL route handlers (so both hops are exercised)
 *  - answers upstream calls (Tavily / JSearch / Gemini) with canned responses
 *  - records every request (URL + body) on both hops
 */
export function installFullStackFetch(upstream?: {
  tavily?: () => Response;
  jsearch?: () => Response;
  gemini?: () => Response;
}) {
  const captured: CapturedRequest[] = [];
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.TAVILY_API_KEY = "test-tavily-key";
  process.env.JSEARCH_API_KEY = "test-jsearch-key";

  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    let body = toText(init?.body);
    if (!body && input instanceof Request) body = await input.clone().text();

    if (url.startsWith("/api/")) {
      captured.push({ hop: "browser→route", url, method, body });
      const handler = ROUTES[url];
      return handler(new Request(`http://localhost${url}`, { method, body, headers: init?.headers }));
    }
    captured.push({ hop: "route→upstream", url, method, body });
    if (url.startsWith("https://api.tavily.com/")) return upstream?.tavily?.() ?? Response.json(TAVILY_OK);
    if (url.startsWith("https://api.openwebninja.com/")) return upstream?.jsearch?.() ?? Response.json(JSEARCH_OK);
    if (url.includes("generativelanguage.googleapis.com")) return upstream?.gemini?.() ?? Response.json(geminiOk());
    throw new Error(`Unexpected fetch to ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return { captured, mock };
}
