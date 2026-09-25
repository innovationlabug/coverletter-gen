import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Ollama de mentira para `npm run bench -- --dry`: implementa /api/chat (NDJSON en stream,
 * con métricas eval_count/eval_duration/load_duration), /api/ps y la descarga con
 * keep_alive: 0. Tiene "personalidad" por modelo para ejercitar todas las ramas del
 * reporte: qwen a veces inventa un porcentaje, una vez se va de tema (como pasó en la
 * prueba real con "carta de interés") y una vez devuelve JSON roto.
 * NO produce números reales: el reporte del modo --dry dice "SIMULADO" en todas partes.
 */
const PROFILES: Record<string, { tps: number; loadMs: number; size: number; params: string; quant: string }> = {
  "gemma4:e2b-it-qat": { tps: 19.7, loadMs: 220, size: 4_051_162_888, params: "4.6B", quant: "Q4_0" },
  "qwen3.5:2b": { tps: 15.5, loadMs: 110, size: 2_361_424_607, params: "2.3B", quant: "Q8_0" },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function negotiationText(model: string, prompt: string): string {
  const gap = /Brecha: ([+-]?[\d.]+) %/.exec(prompt)?.[1] ?? "0";
  const h = hash(prompt);
  if (model.startsWith("qwen") && h % 7 === 0) {
    return "Una carta de interés sirve para calcular el interés compuesto de tus ahorros y el IVA de tus compras.";
  }
  const base = `Tu expectativa implica un cambio de ${gap} % sobre tu salario actual. Es una meta defendible si la conectas con tus logros concretos y con lo que pide la oferta. No la pongas en la carta; guárdala para la conversación con RR. HH. y llega con evidencia de impacto.`;
  return model.startsWith("qwen") && h % 3 === 0 ? `${base} Considera pedir un 5 % adicional como margen.` : base;
}

function requirementsJson(model: string, prompt: string): string {
  const bullets = prompt
    .split("\n")
    .map((l) => /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(l)?.[1])
    .filter((x): x is string => Boolean(x));
  if (model.startsWith("qwen") && hash(prompt) % 5 === 0) return '{"must": ["' + (bullets[0] ?? "x");
  return JSON.stringify({ must: bullets.slice(0, 3), nice: bullets.slice(3), keywords: bullets.slice(0, 2).map((b) => b.split(" ").slice(-1)[0]) });
}

export async function startMockOllama(): Promise<{ url: string; close: () => Promise<void> }> {
  const loaded = new Set<string>();
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};

    if (req.method === "GET" && req.url === "/api/ps") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          models: [...loaded].map((m) => ({ name: m, model: m, size: PROFILES[m]?.size ?? 1e9, size_vram: 0, details: { parameter_size: PROFILES[m]?.params, quantization_level: PROFILES[m]?.quant } })),
        }),
      );
      return;
    }
    if (req.method !== "POST" || req.url !== "/api/chat") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const model = String(body.model);
    const prof = PROFILES[model];
    if (!prof) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `model "${model}" not found` }));
      return;
    }
    if (Array.isArray(body.messages) && body.messages.length === 0 && body.keep_alive === 0) {
      loaded.delete(model);
      res.end(JSON.stringify({ model, done: true, done_reason: "unload" }));
      return;
    }
    const cold = !loaded.has(model);
    if (cold) await sleep(prof.loadMs);
    loaded.add(model);
    const prompt = body.messages.filter((m: { role: string }) => m.role === "user").map((m: { content: string }) => m.content).join("\n");
    const content = body.format ? requirementsJson(model, prompt) : negotiationText(model, prompt);
    const pieces = content.match(/\S+\s*/g) ?? [content];
    res.setHeader("Content-Type", "application/x-ndjson");
    const perToken = 1000 / prof.tps / 40; // 40x más rápido que la realidad: es un mock
    for (const p of pieces) {
      res.write(JSON.stringify({ model, message: { role: "assistant", content: p }, done: false }) + "\n");
      await sleep(perToken);
    }
    const evalCount = pieces.length;
    res.end(
      JSON.stringify({
        model,
        message: { role: "assistant", content: "" },
        done: true,
        done_reason: "stop",
        load_duration: cold ? prof.loadMs * 1e6 : 2e6,
        prompt_eval_count: Math.round(prompt.length / 4),
        eval_count: evalCount,
        eval_duration: Math.round((evalCount / prof.tps) * 1e9),
        total_duration: Math.round((evalCount / prof.tps) * 1e9 + (cold ? prof.loadMs * 1e6 : 0)),
      }) + "\n",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}
