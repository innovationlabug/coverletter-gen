import type { ChatMessage } from "./prompts";

/**
 * Cliente mínimo del API REST de Ollama (POST /api/chat en streaming NDJSON, GET /api/ps).
 * Sin dependencias: lo usan el proxy del servidor y el benchmark. La autenticación (ID token
 * de Cloud Run) la inyecta quien lo llama vía `headers`.
 */

export interface OllamaChatRequest {
  model: string;
  messages: ChatMessage[];
  /** "json" o un JSON Schema (salida estructurada). */
  format?: "json" | Record<string, unknown>;
  options?: { temperature?: number; num_predict?: number; seed?: number; top_p?: number; num_ctx?: number };
  /**
   * false = sin "razonamiento" visible. Qwen 3.5 piensa por defecto y eso multiplica la
   * latencia y rompe el JSON; lo apagamos para ambos modelos para comparar lo mismo.
   */
  think?: boolean;
  keep_alive?: string | number;
}

export interface OllamaStats {
  model: string;
  /** ms desde que salió la petición hasta el primer token con contenido. */
  ttftMs: number | null;
  /** ms de reloj de pared, extremo a extremo. */
  totalMs: number;
  evalCount: number;
  promptEvalCount: number;
  /** tokens/s = eval_count / eval_duration (lo que reporta Ollama, sin red). */
  tokensPerSecond: number | null;
  loadMs: number;
  ollamaTotalMs: number;
  doneReason?: string;
}

export type OllamaEvent =
  | { type: "headers" }
  | { type: "delta"; text: string }
  | { type: "done"; stats: OllamaStats; content: string };

export interface OllamaCallOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

const nsToMs = (ns: number | undefined) => (ns ? ns / 1e6 : 0);

async function postChat(baseUrl: string, body: unknown, opts: OllamaCallOptions): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  return f(new URL("/api/chat", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
}

export async function* streamOllamaChat(
  baseUrl: string,
  req: OllamaChatRequest,
  opts: OllamaCallOptions = {},
): AsyncGenerator<OllamaEvent> {
  const t0 = performance.now();
  let res = await postChat(baseUrl, { ...req, stream: true }, opts);
  if (res.status === 400 && req.think !== undefined) {
    // Modelos sin soporte de "thinking" pueden rechazar el parámetro: reintentar sin él.
    const text = await res.text();
    if (/think/i.test(text)) {
      const { think: _omit, ...rest } = req;
      res = await postChat(baseUrl, { ...rest, stream: true }, opts);
    } else throw new OllamaError(text || "Ollama 400", 400);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new OllamaError(`Ollama respondió ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  yield { type: "headers" };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let ttftMs: number | null = null;
  let final: Record<string, unknown> | null = null;

  const handleLine = function* (line: string): Generator<OllamaEvent> {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as {
      message?: { content?: string };
      done?: boolean;
      error?: string;
    } & Record<string, unknown>;
    if (chunk.error) throw new OllamaError(String(chunk.error));
    const piece = chunk.message?.content ?? "";
    if (piece) {
      if (ttftMs === null) ttftMs = performance.now() - t0;
      content += piece;
      yield { type: "delta", text: piece };
    }
    if (chunk.done) final = chunk;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      yield* handleLine(line);
    }
  }
  yield* handleLine(buffer);

  const f = (final ?? {}) as Record<string, number | string | undefined>;
  const evalCount = Number(f.eval_count ?? 0);
  const evalMs = nsToMs(Number(f.eval_duration ?? 0));
  yield {
    type: "done",
    content,
    stats: {
      model: String(f.model ?? req.model),
      ttftMs,
      totalMs: performance.now() - t0,
      evalCount,
      promptEvalCount: Number(f.prompt_eval_count ?? 0),
      tokensPerSecond: evalMs > 0 ? evalCount / (evalMs / 1000) : null,
      loadMs: nsToMs(Number(f.load_duration ?? 0)),
      ollamaTotalMs: nsToMs(Number(f.total_duration ?? 0)),
      doneReason: f.done_reason as string | undefined,
    },
  };
}

/** Consume el stream completo y devuelve texto + métricas. */
export async function ollamaChat(baseUrl: string, req: OllamaChatRequest, opts: OllamaCallOptions = {}) {
  for await (const ev of streamOllamaChat(baseUrl, req, opts)) {
    if (ev.type === "done") return ev;
  }
  throw new OllamaError("stream sin evento final");
}

export interface OllamaPsModel {
  name: string;
  model: string;
  size: number;
  size_vram: number;
  expires_at?: string;
  context_length?: number;
  details?: { parameter_size?: string; quantization_level?: string; family?: string };
}

/** GPU si el modelo está (aunque sea en parte) en VRAM; CPU si size_vram = 0. */
export function computeMode(m: Pick<OllamaPsModel, "size" | "size_vram">): "gpu" | "cpu" | "partial" {
  if (!m.size_vram) return "cpu";
  return m.size_vram >= m.size ? "gpu" : "partial";
}

export interface OllamaMemory {
  mode: "gpu" | "cpu" | "partial";
  size: number;
  sizeVram: number;
}

export async function ollamaPs(baseUrl: string, opts: OllamaCallOptions = {}): Promise<OllamaPsModel[]> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(new URL("/api/ps", baseUrl), { headers: opts.headers, signal: opts.signal });
  if (!res.ok) throw new OllamaError(`GET /api/ps → ${res.status}`, res.status);
  const json = (await res.json()) as { models?: OllamaPsModel[] };
  return json.models ?? [];
}

/** Descarga un modelo de la GPU: /api/chat con messages vacíos y keep_alive 0. */
export async function ollamaUnload(baseUrl: string, model: string, opts: OllamaCallOptions = {}): Promise<void> {
  const res = await postChat(baseUrl, { model, messages: [], keep_alive: 0, stream: false }, opts);
  if (!res.ok) throw new OllamaError(`unload ${model} → ${res.status}`, res.status);
  await res.text();
}
