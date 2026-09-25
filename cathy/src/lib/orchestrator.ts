import type { Profile } from "./types";
import type { ModelId, LetterPayload, Requirements } from "./schemas";
import type { OllamaStats, OllamaMemory } from "./ollama-client";
import { computeFacts, numberReference, type NegotiationFacts } from "./facts";
import { buildHeuristicNote, type HeuristicNote } from "./note";
import { buildPayload, buildThirdParty, TIER_ALLOWLIST, THIRD_PARTY_DERIVED } from "./router";
import { buildTemplateLetter } from "./template";
import { checkNumberConsistency, type ConsistencyResult } from "./heuristics/consistency";
import { checkOnTopic, type TopicResult } from "./heuristics/topic";
import { extractRequirementsHeuristic } from "./heuristics/requirements";
import { parseRequirements } from "./tasks";

/**
 * Orquestador del lado del cliente (tier 0). Decide qué se calcula en el navegador, qué va
 * al Ollama privado (tier 1) y qué va a Gemini (tier 2) — siempre a través de router.ts.
 * Nunca lanza: si la red o un modelo fallan, degrada a heurísticas + plantilla.
 */

export type OrchestratorEvent =
  | { type: "stage"; stage: "heuristics" | "requirements" | "negotiation" | "letter" | "done" }
  | { type: "ollama-phase"; task: "negotiation" | "requirements"; phase: "connecting" | "waking" | "generating" | "done" | "error" }
  | { type: "draft-delta"; text: string };

export interface TierTraceEntry {
  endpoint: string;
  fields: string[];
  /** Cuerpo exacto enviado (para el panel de tiers). */
  body: unknown;
  status: "ok" | "error" | "skipped";
  note?: string;
}

export interface TierTrace {
  device: string[];
  private: TierTraceEntry[];
  thirdParty: TierTraceEntry | null;
}

export interface GenerateResult {
  mode: "online" | "offline";
  facts: NegotiationFacts;
  note: HeuristicNote;
  draft: { text: string; stats: OllamaStats | null; memory: OllamaMemory | null; consistency: ConsistencyResult; topic: TopicResult } | null;
  draftError: string | null;
  requirements: { items: string[]; structured: Requirements | null; source: "ollama" | "heuristic" | "none"; stats: OllamaStats | null; memory: OllamaMemory | null };
  letter: { text: string; source: "gemini" | "template"; model: string | null; latencyMs: number | null; error: string | null };
  thirdPartyPayload: LetterPayload;
  redactionsOnDevice: number;
  trace: TierTrace;
}

export interface GenerateOptions {
  model: ModelId;
  offline?: boolean;
  fetchImpl?: typeof fetch;
  onEvent?: (e: OrchestratorEvent) => void;
  /** Tiempo sin respuesta antes de mostrar "despertando la GPU". */
  wakingAfterMs?: number;
  /** Corte del lado del cliente para Ollama (el servidor corta a los 300 s). */
  ollamaTimeoutMs?: number;
}

interface OllamaCallResult {
  content: string;
  stats: OllamaStats | null;
  memory: OllamaMemory | null;
}

async function callOllama(
  task: "negotiation" | "requirements",
  body: unknown,
  opts: GenerateOptions,
): Promise<OllamaCallResult> {
  const f = opts.fetchImpl ?? fetch;
  const emit = opts.onEvent ?? (() => {});
  emit({ type: "ollama-phase", task, phase: "connecting" });
  let generating = false;
  const wakingTimer = setTimeout(() => {
    if (!generating) emit({ type: "ollama-phase", task, phase: "waking" });
  }, opts.wakingAfterMs ?? 3500);
  try {
    const res = await f(`/api/ollama/${task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.ollamaTimeoutMs ?? 310_000),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let stats: OllamaStats | null = null;
    let memory: OllamaMemory | null = null;
    const handle = (line: string) => {
      if (!line.trim()) return;
      const ev = JSON.parse(line) as
        | { type: "status"; phase: "connecting" | "generating" }
        | { type: "delta"; text: string }
        | { type: "done"; stats: OllamaStats; content: string; memory?: OllamaMemory | null }
        | { type: "error"; message: string };
      if (ev.type === "status" && ev.phase === "generating") {
        generating = true;
        emit({ type: "ollama-phase", task, phase: "generating" });
      } else if (ev.type === "delta") {
        generating = true;
        content += ev.text;
        if (task === "negotiation") emit({ type: "draft-delta", text: ev.text });
      } else if (ev.type === "done") {
        stats = ev.stats;
        memory = ev.memory ?? null;
        content = ev.content || content;
      } else if (ev.type === "error") {
        throw new Error(ev.message);
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handle(buffer);
    if (!content.trim()) throw new Error("respuesta vacía");
    emit({ type: "ollama-phase", task, phase: "done" });
    return { content, stats, memory };
  } catch (err) {
    emit({ type: "ollama-phase", task, phase: "error" });
    throw err;
  } finally {
    clearTimeout(wakingTimer);
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function generate(profile: Profile, opts: GenerateOptions): Promise<GenerateResult> {
  const emit = opts.onEvent ?? (() => {});
  const f = opts.fetchImpl ?? fetch;

  // Tier 0: todo lo determinista, siempre.
  emit({ type: "stage", stage: "heuristics" });
  const device = buildPayload(profile, "device");
  const facts = computeFacts(device);
  const note = buildHeuristicNote(facts);
  const heuristicReqs = extractRequirementsHeuristic(profile.jobOffer);
  const trace: TierTrace = { device: Object.keys(device), private: [], thirdParty: null };
  const hasOffer = Boolean(profile.jobOffer && profile.jobOffer.trim().length >= 20);

  const offline = opts.offline ?? (typeof navigator !== "undefined" && navigator.onLine === false);
  if (offline) {
    const { payload, findings } = buildThirdParty(profile, { requirements: heuristicReqs });
    return {
      mode: "offline",
      facts,
      note,
      draft: null,
      draftError: "Sin conexión: nota solo con heurísticas.",
      requirements: { items: heuristicReqs, structured: null, source: heuristicReqs.length ? "heuristic" : "none", stats: null, memory: null },
      letter: { text: buildTemplateLetter(payload), source: "template", model: null, latencyMs: null, error: "Sin conexión: carta de plantilla." },
      thirdPartyPayload: payload,
      redactionsOnDevice: findings.length,
      trace,
    };
  }

  // Tier 1: Ollama privado. Nota de negociación (perfil completo) y requisitos (solo la oferta), en paralelo.
  const privatePayload = buildPayload(profile, "private");
  const negotiationBody = { model: opts.model, ...privatePayload };
  const negotiationEntry: TierTraceEntry = {
    endpoint: "/api/ollama/negotiation",
    fields: [...TIER_ALLOWLIST.private],
    body: negotiationBody,
    status: "ok",
  };
  trace.private.push(negotiationEntry);

  emit({ type: "stage", stage: "negotiation" });
  const negotiationP = callOllama("negotiation", negotiationBody, opts);
  negotiationP.catch(() => {}); // se maneja más abajo; evita "unhandled rejection" mientras esperamos otras cosas

  let requirementsItems = heuristicReqs;
  let structured: Requirements | null = null;
  let reqSource: GenerateResult["requirements"]["source"] = heuristicReqs.length ? "heuristic" : "none";
  let reqStats: OllamaStats | null = null;
  let reqMemory: OllamaMemory | null = null;
  if (hasOffer) {
    emit({ type: "stage", stage: "requirements" });
    const reqBody = { model: opts.model, offer: profile.jobOffer! };
    const entry: TierTraceEntry = { endpoint: "/api/ollama/requirements", fields: ["jobOffer"], body: reqBody, status: "ok" };
    trace.private.push(entry);
    try {
      const r = await callOllama("requirements", reqBody, opts);
      const parsed = parseRequirements(r.content);
      reqStats = r.stats;
      reqMemory = r.memory;
      if (parsed.value) {
        structured = parsed.value;
        requirementsItems = [...parsed.value.must, ...parsed.value.nice].slice(0, 12);
        reqSource = "ollama";
      } else {
        entry.note = "JSON inválido: se usaron las viñetas de la oferta.";
      }
    } catch (e) {
      entry.status = "error";
      entry.note = `${errMsg(e)} → viñetas de la oferta (heurística).`;
    }
  }

  // Tier 2: Gemini, solo con el payload redactado del router.
  emit({ type: "stage", stage: "letter" });
  const { payload: letterPayload, findings } = buildThirdParty(profile, { requirements: requirementsItems });
  const letterEntry: TierTraceEntry = {
    endpoint: "/api/letter",
    fields: [...TIER_ALLOWLIST.third_party, ...THIRD_PARTY_DERIVED],
    body: letterPayload,
    status: "ok",
  };
  trace.thirdParty = letterEntry;
  let letter: GenerateResult["letter"];
  try {
    const res = await f("/api/letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(letterPayload),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { letter: string; model: string; latencyMs: number };
    letter = { text: json.letter, source: "gemini", model: json.model, latencyMs: json.latencyMs, error: null };
  } catch (e) {
    letterEntry.status = "error";
    letterEntry.note = errMsg(e);
    letter = { text: buildTemplateLetter(letterPayload), source: "template", model: null, latencyMs: null, error: `Gemini no disponible (${errMsg(e)}): carta de plantilla.` };
  }

  // Borrador del modelo local + chequeo de números contra las heurísticas.
  let draft: GenerateResult["draft"] = null;
  let draftError: string | null = null;
  try {
    const r = await negotiationP;
    draft = {
      text: r.content.trim(),
      stats: r.stats,
      memory: r.memory,
      consistency: checkNumberConsistency(r.content, numberReference(facts, [profile.achievements, profile.jobOffer])),
      topic: checkOnTopic(r.content),
    };
  } catch (e) {
    negotiationEntry.status = "error";
    negotiationEntry.note = errMsg(e);
    draftError = `El modelo local no respondió (${errMsg(e)}). La nota usa solo heurísticas.`;
  }

  emit({ type: "stage", stage: "done" });
  return {
    mode: "online",
    facts,
    note,
    draft,
    draftError,
    requirements: { items: requirementsItems, structured, source: reqSource, stats: reqStats, memory: reqMemory },
    letter,
    thirdPartyPayload: letterPayload,
    redactionsOnDevice: findings.length,
    trace,
  };
}
