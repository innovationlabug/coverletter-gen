/**
 * Resilience: timeouts, retries, fallbacks and offline behaviour of the
 * client orchestrator. fetch is mocked at the /api/* level (browser → route),
 * plus a few tests of the routes' own upstream error mapping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as salaryPOST } from "@/app/api/salary/route";
import { POST as letterPOST } from "@/app/api/letter/route";
import { fetchWithPolicy } from "@/lib/apis/policy";
import { cacheKey } from "@/lib/apis/jsearch";
import { generate, type GenerateOptions } from "@/lib/generate";
import { memoryStorage } from "@/lib/storage";
import { profile } from "./fixtures";
import { geminiOk, installFullStackFetch, JSEARCH_OK } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

const FACTS = {
  facts: [{ id: 1, title: "Tigo lanza 5G", url: "https://example.com/5g", snippet: "Red 5G en Guatemala." }],
  upstream: { url: "https://api.tavily.com/search", body: {} },
};
const BENCHMARK = {
  benchmark: {
    jobTitle: "Software Engineer",
    location: "Guatemala",
    minSalary: 11625,
    medianSalary: 17666.67,
    maxSalary: 22333.33,
    period: "MONTH",
    currency: "GTQ",
    publisher: "Glassdoor",
    publisherLink: null,
    confidence: "VERY_HIGH",
    salaryCount: 59,
    updatedAt: "2026-08-20T08:25:12.000Z",
  },
  upstream: { url: "https://api.openwebninja.com/jsearch/estimated-salary", params: {} },
};
const LETTER = {
  letter: "Estimado equipo:\n\nCarta de Gemini.\n\nAtentamente,\n[[FIRMA]]",
  usedFacts: [1],
  model: "gemini-3.8-flash",
  upstream: { model: "gemini-3.8-flash", prompt: "…" },
};

type Handler = (init?: RequestInit) => Promise<Response> | Response;

/** Route-level mock: a queue of handlers per route; the last one repeats. */
function routeMock(spec: Partial<Record<"/api/company" | "/api/salary" | "/api/letter", Handler[]>>) {
  const calls: Record<string, number> = {};
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls[url] = (calls[url] ?? 0) + 1;
    const queue = spec[url as keyof typeof spec];
    if (!queue) throw new Error(`unexpected ${url}`);
    const h = queue[Math.min(calls[url] - 1, queue.length - 1)];
    return h(init);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const ok = (body: unknown) => () => Response.json(body);
const status = (s: number, code = "x") => () => Response.json({ error: { code, message: code } }, { status: s });
/** Never resolves until aborted (like a hung server). */
const hang: Handler = (init) =>
  new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
const networkError: Handler = () => Promise.reject(new TypeError("fetch failed"));

function opts(fetchImpl: typeof fetch, extra: Partial<GenerateOptions> = {}): GenerateOptions {
  return { fetchImpl, storage: memoryStorage(), isOnline: () => true, backoffMs: 1, ...extra };
}

describe("fetchWithPolicy", () => {
  it("times out with AbortController and does not retry a timeout", async () => {
    const { fn, calls } = routeMock({ "/api/company": [hang] });
    const r = await fetchWithPolicy("/api/company", { method: "POST" }, { timeoutMs: 30, fetchImpl: fn, isOnline: () => true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("timeout");
    expect(calls["/api/company"]).toBe(1);
  });

  it("treats a 504 from our route as timeout (no retry)", async () => {
    const { fn, calls } = routeMock({ "/api/letter": [status(504, "upstream_timeout")] });
    const r = await fetchWithPolicy("/api/letter", {}, { timeoutMs: 1000, fetchImpl: fn, isOnline: () => true });
    expect(!r.ok && r.kind).toBe("timeout");
    expect(calls["/api/letter"]).toBe(1);
  });

  it("does not retry non-retryable errors (424)", async () => {
    const { fn, calls } = routeMock({ "/api/salary": [status(424, "not_subscribed")] });
    const r = await fetchWithPolicy("/api/salary", {}, { timeoutMs: 1000, fetchImpl: fn, isOnline: () => true, backoffMs: 1 });
    expect(!r.ok && r.code).toBe("not_subscribed");
    expect(calls["/api/salary"]).toBe(1);
  });
});

describe("generate() fallbacks", () => {
  it("Tavily timeout → letter without company facts", async () => {
    const { fn } = routeMock({ "/api/company": [hang], "/api/salary": [ok(BENCHMARK)], "/api/letter": [ok({ ...LETTER, usedFacts: [] })] });
    const r = await generate(profile(), opts(fn, { timeouts: { tavily: 30 } }));
    expect(r.statuses.tavily.status).toBe("timeout");
    expect(r.facts).toEqual([]);
    expect(r.letter.source).toBe("gemini");
    expect(r.letter.usedFacts).toEqual([]);
  });

  it("Gemini 429 then success → retried once, letter from Gemini", async () => {
    const { fn, calls } = routeMock({
      "/api/company": [ok(FACTS)],
      "/api/salary": [ok(BENCHMARK)],
      "/api/letter": [status(429, "rate_limited"), ok(LETTER)],
    });
    const r = await generate(profile(), opts(fn));
    expect(calls["/api/letter"]).toBe(2);
    expect(r.statuses.gemini.status).toBe("ok");
    expect(r.statuses.gemini.attempts).toBe(2);
    expect(r.letter.source).toBe("gemini");
    expect(r.letter.text).toContain("Ana Lucía Pérez");
    expect(r.letter.usedFacts.map((f) => f.url)).toEqual(["https://example.com/5g"]);
  });

  it("Gemini 500 twice → template letter", async () => {
    const { fn, calls } = routeMock({
      "/api/company": [ok(FACTS)],
      "/api/salary": [ok(BENCHMARK)],
      "/api/letter": [status(500), status(500)],
    });
    const r = await generate(profile(), opts(fn));
    expect(calls["/api/letter"]).toBe(2);
    expect(r.statuses.gemini.status).toBe("failed");
    expect(r.letter.source).toBe("template");
    expect(r.letter.text).toContain("Estimado equipo de selección de Tigo Guatemala");
  });

  it("Gemini timeout → template letter", async () => {
    const { fn } = routeMock({ "/api/company": [ok(FACTS)], "/api/salary": [ok(BENCHMARK)], "/api/letter": [hang] });
    const r = await generate(profile(), opts(fn, { timeouts: { gemini: 30 } }));
    expect(r.statuses.gemini.status).toBe("timeout");
    expect(r.letter.source).toBe("template");
  });

  it("JSearch 403 (not subscribed) → note without benchmark", async () => {
    const { fn, calls } = routeMock({
      "/api/company": [ok(FACTS)],
      "/api/salary": [status(424, "not_subscribed")],
      "/api/letter": [ok(LETTER)],
    });
    const r = await generate(profile(), opts(fn));
    expect(calls["/api/salary"]).toBe(1);
    expect(r.statuses.jsearch.status).toBe("failed");
    expect(r.benchmark).toBeNull();
    expect(r.note.market).toBeNull();
    expect(r.note.sections.find((s) => s.id === "market")!.items[0]).toMatch(/no está suscrita.*403/);
    expect(r.note.band.id).toBe("realistic");
  });

  it("offline (fetch rejects) → template letter + note, statuses 'offline'", async () => {
    const { fn, calls } = routeMock({ "/api/company": [networkError], "/api/salary": [networkError], "/api/letter": [networkError] });
    const r = await generate(profile(), opts(fn));
    expect(calls["/api/company"]).toBe(2); // 1 retry on network error
    expect(r.statuses.tavily.status).toBe("offline");
    expect(r.statuses.gemini.status).toBe("offline");
    expect(r.letter.source).toBe("template");
    expect(r.note.headline).toMatch(/Realista/);
  });

  it("navigator.onLine=false → no request at all, template letter", async () => {
    const { fn } = routeMock({});
    const r = await generate(profile(), opts(fn, { isOnline: () => false }));
    expect(fn).not.toHaveBeenCalled();
    expect(r.statuses.gemini.status).toBe("offline");
    expect(r.letter.source).toBe("template");
    expect(r.outgoing).toEqual([]);
  });
});

describe("JSearch localStorage cache", () => {
  it("caches a benchmark and reuses it offline for 7 days", async () => {
    const storage = memoryStorage();
    const online = routeMock({ "/api/company": [ok(FACTS)], "/api/salary": [ok(BENCHMARK)], "/api/letter": [ok(LETTER)] });
    const t0 = Date.parse("2026-09-01T00:00:00Z");
    await generate(profile(), opts(online.fn, { storage, now: () => t0 }));
    expect(Object.keys(storage.dump())).toEqual([
      cacheKey({ jobTitle: "Software Engineer", location: "Guatemala", yearsBucket: "FOUR_TO_SIX" }),
    ]);

    const offline = routeMock({});
    const r = await generate(profile(), opts(offline.fn, { storage, isOnline: () => false, now: () => t0 + 3 * 86_400_000 }));
    expect(r.statuses.jsearch.status).toBe("cached");
    expect(r.note.market?.fromCache).toBe(true);
    expect(r.letter.source).toBe("template");

    const expired = await generate(profile(), opts(offline.fn, { storage, isOnline: () => false, now: () => t0 + 8 * 86_400_000 }));
    expect(expired.note.market).toBeNull();
  });

  it("survives a storage that throws", async () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {},
    };
    const { fn } = routeMock({ "/api/company": [ok(FACTS)], "/api/salary": [ok(BENCHMARK)], "/api/letter": [ok(LETTER)] });
    const r = await generate(profile(), opts(fn, { storage: broken }));
    expect(r.note.market).not.toBeNull();
  });
});

describe("route handlers map upstream failures", () => {
  it("JSearch upstream 403 'not subscribed' → 424 not_subscribed", async () => {
    installFullStackFetch({
      jsearch: () => Response.json({ message: "You are not subscribed to this API." }, { status: 403 }),
    });
    const res = await salaryPOST(
      new Request("http://localhost/api/salary", {
        method: "POST",
        body: JSON.stringify({ jobTitle: "Dev", location: "Guatemala", yearsBucket: "ONE_TO_THREE" }),
      }),
    );
    expect(res.status).toBe(424);
    expect((await res.json()).error.code).toBe("not_subscribed");
  });

  it("JSearch empty data → 200 with benchmark null", async () => {
    installFullStackFetch({ jsearch: () => Response.json({ status: "OK", data: [] }) });
    const res = await salaryPOST(
      new Request("http://localhost/api/salary", {
        method: "POST",
        body: JSON.stringify({ jobTitle: "Dev", location: "Guatemala", yearsBucket: "ONE_TO_THREE" }),
      }),
    );
    expect(await res.json()).toMatchObject({ benchmark: null });
  });

  it("JSearch OK → normalized benchmark", async () => {
    installFullStackFetch({ jsearch: () => Response.json(JSEARCH_OK) });
    const res = await salaryPOST(
      new Request("http://localhost/api/salary", {
        method: "POST",
        body: JSON.stringify({ jobTitle: "Software Engineer", location: "Guatemala", yearsBucket: "FOUR_TO_SIX" }),
      }),
    );
    const body = await res.json();
    expect(body.benchmark).toMatchObject({ medianSalary: 17666.67, period: "MONTH", currency: "GTQ", salaryCount: 59 });
    expect(JSON.stringify(body)).not.toContain("test-jsearch-key");
  });

  it("Gemini upstream 500 → 502 (retryable), 429 → 429", async () => {
    const body = JSON.stringify({
      desiredRole: "Dev",
      targetCompany: "Tigo",
      yearsExperience: 3,
      achievements: "",
      jobOffer: "",
      companyFacts: [],
    });
    installFullStackFetch({ gemini: () => Response.json({ error: { code: 500, message: "boom", status: "INTERNAL" } }, { status: 500 }) });
    expect((await letterPOST(new Request("http://localhost/api/letter", { method: "POST", body }))).status).toBe(502);
    installFullStackFetch({
      gemini: () => Response.json({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }, { status: 429 }),
    });
    expect((await letterPOST(new Request("http://localhost/api/letter", { method: "POST", body }))).status).toBe(429);
    installFullStackFetch({ gemini: () => Response.json(geminiOk("Hola\n[[FIRMA]]", [7])) });
    const okRes = await letterPOST(new Request("http://localhost/api/letter", { method: "POST", body }));
    expect(await okRes.json()).toMatchObject({ letter: "Hola\n[[FIRMA]]", usedFacts: [] });
  });

  it("rejects cross-origin browser calls", async () => {
    const res = await letterPOST(
      new Request("http://localhost/api/letter", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "localhost" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(403);
  });
});
