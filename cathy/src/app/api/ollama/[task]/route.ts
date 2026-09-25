import { OllamaNegotiationBody, OllamaRequirementsBody } from "@/lib/schemas";
import { buildNegotiationRequest, buildRequirementsRequest, type OllamaTask } from "@/lib/tasks";
import { streamOllamaChat, ollamaPs, computeMode, OllamaError, type OllamaChatRequest } from "@/lib/ollama-client";
import { ollamaAuthHeaders } from "@/lib/server/ollama-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cold start: con GPU L4 (arranque + carga del modelo) ~30–60 s; en modo CPU (sin cuota de
 * GPU) medimos ~57 s (qwen3.5) y ~115 s (gemma4) solo de carga. 300 s cubre ambos.
 */
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 300_000);

/**
 * Proxy al Ollama privado (tier 1). El cliente manda DATOS; el prompt se arma aquí.
 * Responde NDJSON con eventos propios:
 *   {type:"status", phase:"connecting"}  → enviado de inmediato
 *   {type:"status", phase:"generating"}  → Ollama respondió (la GPU ya está despierta)
 *   {type:"delta", text}                 → tokens
 *   {type:"done", stats, content}        → métricas (TTFT, tok/s, load)
 *   {type:"error", message}
 */
export async function POST(req: Request, ctx: { params: Promise<{ task: string }> }) {
  const { task } = await ctx.params;
  if (task !== "negotiation" && task !== "requirements") {
    return Response.json({ error: "unknown_task" }, { status: 404 });
  }
  const ollamaUrl = process.env.OLLAMA_URL;
  if (!ollamaUrl) return Response.json({ error: "ollama_not_configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  let chatReq: OllamaChatRequest;
  if ((task as OllamaTask) === "negotiation") {
    const parsed = OllamaNegotiationBody.safeParse(body);
    if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues.length }, { status: 400 });
    chatReq = buildNegotiationRequest(parsed.data.model, parsed.data.profile);
  } else {
    const parsed = OllamaRequirementsBody.safeParse(body);
    if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues.length }, { status: 400 });
    chatReq = buildRequirementsRequest(parsed.data.model, parsed.data.offer);
  }

  const encoder = new TextEncoder();
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(OLLAMA_TIMEOUT_MS)]);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "status", phase: "connecting", model: chatReq.model });
      try {
        const headers = await ollamaAuthHeaders(ollamaUrl);
        for await (const ev of streamOllamaChat(ollamaUrl, chatReq, { headers, signal })) {
          if (ev.type === "headers") send({ type: "status", phase: "generating" });
          else if (ev.type === "delta") send({ type: "delta", text: ev.text });
          else {
            // /api/ps después de generar: ¿el modelo quedó en VRAM (GPU) o en RAM (CPU)?
            const ps = await ollamaPs(ollamaUrl, { headers, signal: AbortSignal.timeout(5_000) }).catch(() => []);
            const loaded = ps.find((m) => m.name === chatReq.model || m.model === chatReq.model);
            send({
              type: "done",
              content: ev.content,
              stats: ev.stats,
              memory: loaded ? { mode: computeMode(loaded), size: loaded.size, sizeVram: loaded.size_vram } : null,
            });
          }
        }
      } catch (err) {
        const timeout = signal.aborted && !req.signal.aborted;
        const message = timeout
          ? `Ollama no respondió en ${Math.round(OLLAMA_TIMEOUT_MS / 1000)} s`
          : err instanceof OllamaError
            ? err.message
            : "No se pudo contactar al Ollama privado";
        console.error("[ollama-proxy]", task, err instanceof Error ? err.message : err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
