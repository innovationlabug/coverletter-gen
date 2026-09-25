/**
 * PRUEBA DE FUGA (condición 2 del ejercicio, en la versión de Cathy):
 *   el salario (en todas sus formas escritas) y el empleador actual solo pueden aparecer en
 *   peticiones a /api/ollama/* (tier 1, nube privada del dueño) y NUNCA en /api/letter
 *   (tier 2, Gemini). Offline, no sale ninguna petición.
 *
 * Se corre el orquestador REAL del cliente con `fetch` simulado y se escanea cada cuerpo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generate } from "@/lib/orchestrator";
import { writtenForms } from "@/lib/heuristics/money";
import { distinctiveEmployerTokens } from "@/lib/heuristics/redactor";
import { toGTQ } from "@/lib/heuristics/currency";
import { fold } from "@/lib/heuristics/fold";
import type { Profile } from "@/lib/types";
import { loadInputs } from "./fixtures/profiles";

// letter route (servidor) con Gemini simulado
const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  ThinkingLevel: { LOW: "LOW" },
}));

interface Captured {
  url: string;
  body: string;
}

function ndjson(events: unknown[]): Response {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

/** Ollama "malicioso": devuelve requisitos que repiten el salario y el empleador. */
function adversarialRequirements(p: Profile) {
  return JSON.stringify({
    must: [`Experiencia similar a ${p.currentEmployer}`, `Salario actual de Q${p.currentSalary.amount.toLocaleString("en-US")}`],
    nice: [`Ganar ${p.desiredSalary.amount} al mes`],
    keywords: ["SQL", p.currentEmployer.toUpperCase()],
  });
}

function mockFetch(profile: Profile, captured: Captured[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === "string" ? init.body : "";
    captured.push({ url, body });
    if (url.startsWith("/api/ollama/negotiation")) {
      return ndjson([
        { type: "status", phase: "connecting" },
        { type: "status", phase: "generating" },
        { type: "delta", text: "Tu expectativa es razonable. " },
        { type: "done", content: "Tu expectativa es razonable. Pide 99 % más.", stats: { model: "gemma4:e2b-it-qat", ttftMs: 100, totalMs: 900, evalCount: 50, promptEvalCount: 300, tokensPerSecond: 80, loadMs: 0, ollamaTotalMs: 800 } },
      ]);
    }
    if (url.startsWith("/api/ollama/requirements")) {
      const content = adversarialRequirements(profile);
      return ndjson([{ type: "status", phase: "generating" }, { type: "delta", text: content }, { type: "done", content, stats: null }]);
    }
    if (url.startsWith("/api/letter")) {
      return Response.json({ letter: "Estimado equipo…", model: "gemini-3.8-flash", latencyMs: 1200 });
    }
    return new Response("not found", { status: 404 });
  });
}

function salaryForms(p: Profile): string[] {
  const amounts = [p.currentSalary.amount, p.desiredSalary.amount, Math.round(toGTQ(p.currentSalary.amount, p.currentSalary.currency)), Math.round(toGTQ(p.desiredSalary.amount, p.desiredSalary.currency))];
  return [...new Set(amounts.flatMap(writtenForms))];
}

function containsForm(body: string, form: string): boolean {
  // Un número no debe "encontrarse" dentro de otro más largo (15000 dentro de 150000).
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\d.,])${escaped}(?![\\d])`, "i").test(body);
}

function employerNeedles(p: Profile): string[] {
  return [fold(p.currentEmployer).replace(/[, ]+s\.?\s?a\.?$/i, ""), ...distinctiveEmployerTokens(p.currentEmployer)];
}

const inputs = loadInputs();

describe("fuga: el salario y el empleador solo viajan al tier 1", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => generateContent.mockReset());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it.each(inputs.map((i) => [i.id, i.profile] as const))("perfil %s", async (_id, profile) => {
    const captured: Captured[] = [];
    globalThis.fetch = mockFetch(profile, captured) as unknown as typeof fetch;
    // perfil endurecido: el salario y el empleador también "escondidos" en los logros
    const hardened: Profile = {
      ...profile,
      achievements: `${profile.achievements} Hoy en ${profile.currentEmployer.toUpperCase()} gano ${writtenForms(profile.currentSalary.amount).at(-1)} y quiero ${profile.desiredSalary.amount}.`,
    };
    const result = await generate(hardened, { model: "gemma4:e2b-it-qat" });

    const toOllama = captured.filter((c) => c.url.startsWith("/api/ollama/"));
    const toLetter = captured.filter((c) => c.url.startsWith("/api/letter"));
    const others = captured.filter((c) => !c.url.startsWith("/api/ollama/") && !c.url.startsWith("/api/letter"));
    expect(others).toEqual([]);
    expect(toLetter).toHaveLength(1);

    // control positivo: la prueba SÍ ve el salario donde se permite (si no, el escaneo no probaría nada)
    const negotiation = toOllama.find((c) => c.url.endsWith("/negotiation"))!;
    expect(containsForm(negotiation.body, String(profile.currentSalary.amount))).toBe(true);
    expect(fold(negotiation.body)).toContain(fold(profile.currentEmployer));

    for (const { body } of toLetter) {
      for (const form of salaryForms(profile)) {
        expect(containsForm(body, form), `forma "${form}" en /api/letter`).toBe(false);
      }
      for (const needle of employerNeedles(profile)) {
        expect(fold(body), `empleador "${needle}" en /api/letter`).not.toContain(needle);
      }
      for (const key of ["currentSalary", "desiredSalary", "currentEmployer", "email", "phone", "jobOffer"]) {
        expect(body).not.toContain(`"${key}"`);
      }
      if (profile.email) expect(body).not.toContain(profile.email);
    }

    // los números del modelo no se confían: el "99 %" inventado queda marcado
    expect(result.draft?.consistency.ok).toBe(false);
    expect(result.letter.source).toBe("gemini");
  });

  it("offline: no sale ninguna petición y aun así hay nota + carta", async () => {
    const f = vi.fn();
    globalThis.fetch = f as unknown as typeof fetch;
    const r = await generate(inputs[0].profile, { model: "qwen3.5:2b", offline: true });
    expect(f).not.toHaveBeenCalled();
    expect(r.mode).toBe("offline");
    expect(r.letter.source).toBe("template");
    expect(r.letter.text).toContain(inputs[0].profile.fullName);
    expect(r.note.figures.length).toBeGreaterThan(0);
    expect(r.letter.text).not.toMatch(/Banco Industrial|15,000/);
  });

  it("si Ollama y Gemini fallan, degrada a heurísticas + plantilla", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const r = await generate(inputs[1].profile, { model: "gemma4:e2b-it-qat" });
    expect(r.draft).toBeNull();
    expect(r.draftError).toMatch(/heurísticas/);
    expect(r.requirements.source).toBe("heuristic");
    expect(r.letter.source).toBe("template");
    expect(r.letter.text).toMatch(/^Dear Nearshore Labs/);
  });
});

describe("fuga (servidor): la ruta /api/letter nunca le pasa el salario a Gemini", () => {
  beforeEach(() => {
    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: "Estimado equipo de Cervecería Centro Americana: … [MONTO] …" });
  });

  const base = {
    fullName: "María José Castillo",
    desiredRole: "Analista de BI Senior",
    targetCompany: "Cervecería Centro Americana",
    yearsExperience: 5,
    requirements: ["SQL avanzado", "Salario Q16,000 - Q19,000"],
    language: "es",
    seniority: "senior",
  };

  async function post(body: unknown) {
    const { POST } = await import("@/app/api/letter/route");
    return POST(new Request("http://test/api/letter", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
  }

  it("un cliente modificado esconde el salario en los logros → se redacta antes de Gemini", async () => {
    const res = await post({
      ...base,
      achievements: "Automaticé reportes. Mi salario actual es Q15,000 (15k, Q 15 000, 15 mil, quince mil) y pido USD 2000. Correo: majo@correo.gt, tel 5512-3344.",
    });
    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(generateContent.mock.calls[0][0]);
    for (const form of [...writtenForms(15000), "quince mil", "USD 2000", "16,000", "19,000", "majo@correo.gt", "5512-3344"]) {
      expect(containsForm(sent, form), `forma "${form}" enviada a Gemini`).toBe(false);
    }
    const json = await res.json();
    expect(json.letter).not.toContain("[MONTO]");
    expect(json.serverRedactions).toBeGreaterThanOrEqual(8);
  });

  it("reintenta una vez si Vertex responde 500 transitorio", async () => {
    generateContent.mockReset();
    generateContent.mockRejectedValueOnce(new Error('{"error":{"code":500,"status":"INTERNAL"}}')).mockResolvedValueOnce({ text: "Carta ok" });
    const res = await post({ ...base, achievements: "Automaticé reportes." });
    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("campos fuera de la allowlist → 400 y Gemini no se llama", async () => {
    const res = await post({ ...base, achievements: "x", currentSalary: { amount: 15000, currency: "GTQ" } });
    expect(res.status).toBe(400);
    expect((await res.json()).unknownKeys).toEqual(["currentSalary"]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("residuo sensible después de redactar → 422 y Gemini no se llama", async () => {
    const res = await post({ ...base, achievements: "Hoy gano bastantes quetzales" });
    expect(res.status).toBe(422);
    expect(generateContent).not.toHaveBeenCalled();
  });
});
