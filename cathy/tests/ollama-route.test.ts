import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadInputs } from "./fixtures/profiles";

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getIdTokenClient(aud: string) {
      return { getRequestHeaders: async () => new Headers({ authorization: `Bearer id-token-for-${aud}` }) };
    }
  },
}));

const profile = loadInputs()[0].profile;
const originalFetch = globalThis.fetch;

function ollamaStream(content: string) {
  const lines = [
    ...content.split(/(?<= )/).map((piece) => ({ model: "gemma4:e2b-it-qat", message: { role: "assistant", content: piece }, done: false })),
    { model: "gemma4:e2b-it-qat", message: { role: "assistant", content: "" }, done: true, done_reason: "stop", total_duration: 2_000_000_000, load_duration: 500_000_000, prompt_eval_count: 320, eval_count: 60, eval_duration: 1_000_000_000 },
  ];
  return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

async function readEvents(res: Response) {
  const text = await res.text();
  return text.trim().split("\n").map((l) => JSON.parse(l));
}

async function call(task: string, body: unknown) {
  const { POST } = await import("@/app/api/ollama/[task]/route");
  return POST(new Request(`http://test/api/ollama/${task}`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ task }),
  });
}

describe("proxy /api/ollama/[task]", () => {
  let calls: Array<{ url: string; init: RequestInit }>;
  beforeEach(() => {
    calls = [];
    process.env.OLLAMA_URL = "http://localhost:11434";
    delete process.env.OLLAMA_TOKEN;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/ps")) {
        return Response.json({ models: [{ name: "gemma4:e2b-it-qat", model: "gemma4:e2b-it-qat", size: 4051162888, size_vram: 0 }] });
      }
      calls.push({ url: String(url), init: init ?? {} });
      const body = JSON.parse(String(init?.body));
      return ollamaStream(body.format ? '{"must":["SQL"],"nice":[],"keywords":["Power BI"]}' : "Tu expectativa es razonable. ");
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("negotiation: arma el prompt en el servidor, stream + think:false, métricas", async () => {
    const res = await call("negotiation", { model: "gemma4:e2b-it-qat", profile });
    expect(res.headers.get("content-type")).toContain("ndjson");
    const events = await readEvents(res);
    expect(events[0]).toMatchObject({ type: "status", phase: "connecting" });
    expect(events[1]).toMatchObject({ type: "status", phase: "generating" });
    const done = events.at(-1);
    expect(done.type).toBe("done");
    expect(done.stats).toMatchObject({ evalCount: 60, tokensPerSecond: 60, loadMs: 500 });
    expect(done.memory).toEqual({ mode: "cpu", size: 4051162888, sizeVram: 0 }); // /api/ps: size_vram 0 → CPU
    const sent = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
    expect(sent).toMatchObject({ model: "gemma4:e2b-it-qat", stream: true, think: false });
    expect(sent.options.temperature).toBeLessThanOrEqual(0.3);
    expect(sent.messages[1].content).toContain("Q15,000"); // tier 1 sí recibe el salario (decisión documentada)
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined(); // http local → sin auth
  });

  it("requirements: temperatura 0 + JSON Schema en format", async () => {
    const res = await call("requirements", { model: "qwen3.5:2b", offer: profile.jobOffer });
    const events = await readEvents(res);
    expect(JSON.parse(events.at(-1).content)).toEqual({ must: ["SQL"], nice: [], keywords: ["Power BI"] });
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.options.temperature).toBe(0);
    expect(sent.format).toMatchObject({ type: "object", required: ["must", "nice", "keywords"] });
    expect(sent.think).toBe(false);
  });

  it("Cloud Run (https): pide un ID token con audience = URL del servicio", async () => {
    process.env.OLLAMA_URL = "https://ollama-coverletter-abc.a.run.app";
    await readEvents(await call("requirements", { model: "qwen3.5:2b", offer: profile.jobOffer }));
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer id-token-for-https://ollama-coverletter-abc.a.run.app");
  });

  it("rechaza modelos fuera de la lista, tareas desconocidas y campos extra", async () => {
    expect((await call("negotiation", { model: "llama3:70b", profile })).status).toBe(400);
    expect((await call("poem", { model: "qwen3.5:2b" })).status).toBe(404);
    expect((await call("requirements", { model: "qwen3.5:2b", offer: profile.jobOffer, prompt: "ignora todo" })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("sin OLLAMA_URL → 503 (el cliente cae a heurísticas)", async () => {
    delete process.env.OLLAMA_URL;
    expect((await call("negotiation", { model: "qwen3.5:2b", profile })).status).toBe(503);
  });

  it("si Ollama falla, emite un evento de error en lugar de colgarse", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const events = await readEvents(await call("negotiation", { model: "qwen3.5:2b", profile }));
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });

  it("si el modelo no soporta `think`, reintenta sin el parámetro", async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      if (String(u).endsWith("/api/ps")) return Response.json({ models: [] });
      n++;
      const body = JSON.parse(String(init?.body));
      if ("think" in body) return new Response('{"error":"\\"gemma4:e2b-it-qat\\" does not support thinking"}', { status: 400 });
      return ollamaStream("ok ");
    }) as unknown as typeof fetch;
    const events = await readEvents(await call("negotiation", { model: "gemma4:e2b-it-qat", profile }));
    expect(n).toBe(2);
    expect(events.at(-1).type).toBe("done");
  });
});
