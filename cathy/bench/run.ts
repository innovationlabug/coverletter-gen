/**
 * Benchmark: gemma4:e2b-it-qat vs qwen3.5:2b en las tareas de ESTA app.
 *
 *   npm run bench                         # contra OLLAMA_URL (Cloud Run o local)
 *   npm run bench -- --dry                # contra un Ollama simulado (sin GPU, sin red)
 *   npm run bench -- --runs 1 --inputs 6 --no-judge
 *
 * Flags: --dry · --runs N (3) · --inputs N (todas) · --models a,b · --tasks negotiation,requirements
 *        --no-cold · --no-judge · --timeout-ms N (400000)
 *        --from bench/results/X.json  → NO vuelve a llamar a Ollama: recalcula la calidad
 *                                       determinista con el código actual y completa los
 *                                       veredictos del juez que falten (p. ej. por 429).
 *        --from X.json --rejudge      → descarta los veredictos y vuelve a juzgar todo.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Profile } from "../src/lib/types";
import { MODELS } from "../src/lib/schemas";
import { PROMPT_VERSION } from "../src/lib/prompts";
import { buildNegotiationRequest, buildRequirementsRequest, TASK_SETTINGS, type OllamaTask } from "../src/lib/tasks";
import { ollamaChat, ollamaPs, ollamaUnload, computeMode, type OllamaChatRequest, type OllamaStats } from "../src/lib/ollama-client";
import { GTQ_PER_USD } from "../src/lib/heuristics/currency";
import { benchAuthHeaders } from "./lib/auth";
import { negotiationQuality, requirementsQuality, type NegotiationQuality, type RequirementsQuality } from "./lib/quality";
import { judgeGemini, judgeMock, type JudgeVerdict } from "./lib/judge";
import { startMockOllama } from "./mock-ollama";
import { writeReport } from "./report";

interface BenchInput {
  id: string;
  description: string;
  profile: Profile;
}

export interface CallRecord {
  model: string;
  inputId: string;
  task: OllamaTask;
  run: number;
  kind: "cold" | "warm";
  ok: boolean;
  error?: string;
  stats: OllamaStats | null;
  content: string;
  quality: NegotiationQuality | RequirementsQuality | null;
}

export interface MemoryRecord {
  model: string;
  size: number;
  sizeVram: number;
  mode: "gpu" | "cpu" | "partial";
  parameterSize?: string;
  quantization?: string;
}

export interface BenchResults {
  meta: {
    timestamp: string;
    dry: boolean;
    ollamaHost: string;
    models: string[];
    tasks: OllamaTask[];
    runs: number;
    inputs: Array<{ id: string; description: string; hasOffer: boolean }>;
    promptVersion: string;
    settings: Record<OllamaTask, unknown>;
    temperature: number;
    judge: string | null;
    gtqPerUsd: number;
    durationMs: number;
  };
  memory: MemoryRecord[];
  calls: CallRecord[];
  judge: JudgeVerdict[];
}

function args() {
  const a = process.argv.slice(2);
  const val = (name: string) => {
    const i = a.indexOf(`--${name}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    dry: a.includes("--dry"),
    runs: Number(val("runs") ?? 3),
    inputs: val("inputs") ? Number(val("inputs")) : Infinity,
    models: (val("models")?.split(",") ?? [...MODELS]) as string[],
    tasks: (val("tasks")?.split(",") ?? ["negotiation", "requirements"]) as OllamaTask[],
    cold: !a.includes("--no-cold"),
    judge: !a.includes("--no-judge"),
    timeoutMs: Number(val("timeout-ms") ?? 400_000),
    from: val("from"),
  };
}

function loadInputs(limit: number): BenchInput[] {
  const dir = fileURLToPath(new URL("./inputs/", import.meta.url));
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .slice(0, limit)
    .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as BenchInput);
}

/** Mismo prompt y opciones que la app, salvo temperatura 0 en ambas tareas (reproducibilidad). */
function benchRequest(task: OllamaTask, model: string, p: Profile): OllamaChatRequest {
  const req = task === "negotiation" ? buildNegotiationRequest(model, p) : buildRequirementsRequest(model, p.jobOffer!);
  return { ...req, options: { ...req.options, temperature: 0, seed: 42 } };
}

const log = (...x: unknown[]) => console.log(...x);

function inputsById(): Map<string, BenchInput> {
  return new Map(loadInputs(Infinity).map((i) => [i.id, i]));
}

async function judgeMissing(results: BenchResults, inputs: BenchInput[], dry: boolean): Promise<void> {
  for (const input of inputs) {
    for (const task of results.meta.tasks) {
      if (results.judge.some((v) => v.inputId === input.id && v.task === task)) continue;
      const outputs: Record<string, string> = {};
      for (const model of results.meta.models) {
        const c = results.calls.find((x) => x.model === model && x.inputId === input.id && x.task === task && x.kind === "warm" && x.ok);
        if (c) outputs[model] = c.content;
      }
      if (Object.keys(outputs).length < 2) continue;
      try {
        const v = dry ? judgeMock(input.id, task, outputs) : await judgeGemini(input.id, task, input.profile, outputs);
        results.judge.push(v);
        log(`  ${input.id} ${task}: ${Object.entries(v.scores).map(([m, sc]) => `${m}=${Object.values(sc).join("/")}`).join("  ")}`);
      } catch (e) {
        log(`  ✗ juez ${input.id} ${task}: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
      }
    }
  }
}

async function rescore(file: string) {
  const results = JSON.parse(readFileSync(file, "utf8")) as BenchResults;
  const byId = inputsById();
  for (const c of results.calls) {
    const input = byId.get(c.inputId);
    if (!c.ok || !input) continue;
    c.quality = c.task === "negotiation" ? negotiationQuality(c.content, input.profile) : requirementsQuality(c.content, input.profile.jobOffer!);
  }
  if (process.argv.includes("--rejudge")) results.judge = [];
  if (results.meta.judge) {
    log(`== juez: completando veredictos faltantes (${results.judge.length} existentes)`);
    await judgeMissing(results, results.meta.inputs.map((i) => byId.get(i.id)!).filter(Boolean), results.meta.dry);
    results.judge.sort((a, b) => a.inputId.localeCompare(b.inputId) || a.task.localeCompare(b.task));
  }
  (results.meta as BenchResults["meta"] & { rescoredAt?: string }).rescoredAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(results, null, 2));
  log(`Resultados actualizados: ${file}\nReporte: ${writeReport(results)}`);
}

async function main() {
  const opt = args();
  if (opt.from) return rescore(opt.from);
  const t0 = Date.now();
  let mock: Awaited<ReturnType<typeof startMockOllama>> | null = null;
  let ollamaUrl = process.env.OLLAMA_URL ?? "";
  if (opt.dry) {
    mock = await startMockOllama();
    ollamaUrl = mock.url;
    log(`[dry] Ollama simulado en ${ollamaUrl}`);
  }
  if (!ollamaUrl) throw new Error("Falta OLLAMA_URL (o usa --dry)");

  const headers = () => benchAuthHeaders(ollamaUrl);
  const inputs = loadInputs(opt.inputs);
  const calls: CallRecord[] = [];
  const memory: MemoryRecord[] = [];

  const call = async (model: string, input: BenchInput, task: OllamaTask, run: number, kind: "cold" | "warm") => {
    const req = benchRequest(task, model, input.profile);
    try {
      const r = await ollamaChat(ollamaUrl, req, { headers: headers(), signal: AbortSignal.timeout(opt.timeoutMs) });
      const quality = task === "negotiation" ? negotiationQuality(r.content, input.profile) : requirementsQuality(r.content, input.profile.jobOffer!);
      const rec: CallRecord = { model, inputId: input.id, task, run, kind, ok: true, stats: r.stats, content: r.content, quality };
      calls.push(rec);
      log(
        `  ${kind === "cold" ? "FRÍO " : ""}${model} ${input.id} ${task} #${run}: ttft=${Math.round(r.stats.ttftMs ?? 0)}ms total=${Math.round(r.stats.totalMs)}ms ${r.stats.tokensPerSecond?.toFixed(1)} tok/s calidad=${quality.score.toFixed(2)}`,
      );
      return rec;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      calls.push({ model, inputId: input.id, task, run, kind, ok: false, error, stats: null, content: "", quality: null });
      log(`  ✗ ${model} ${input.id} ${task} #${run}: ${error}`);
      return null;
    }
  };

  for (const model of opt.models) {
    log(`\n== ${model}`);
    if (opt.cold) {
      // Frío = modelo fuera de memoria (el contenedor sigue vivo). Descargamos todo lo cargado.
      for (const m of await ollamaPs(ollamaUrl, { headers: headers() }).catch(() => [])) {
        await ollamaUnload(ollamaUrl, m.name, { headers: headers() }).catch(() => {});
      }
      await call(model, inputs[0], "negotiation", 0, "cold");
    }
    const ps = await ollamaPs(ollamaUrl, { headers: headers() }).catch(() => []);
    const loaded = ps.find((m) => m.name === model || m.model === model);
    if (loaded) {
      memory.push({
        model,
        size: loaded.size,
        sizeVram: loaded.size_vram,
        mode: computeMode(loaded),
        parameterSize: loaded.details?.parameter_size,
        quantization: loaded.details?.quantization_level,
      });
    }
    for (const input of inputs) {
      for (const task of opt.tasks) {
        if (task === "requirements" && !input.profile.jobOffer) continue;
        for (let run = 1; run <= opt.runs; run++) await call(model, input, task, run, "warm");
      }
    }
  }

  // Juez: primera corrida tibia de cada modelo, por entrada y tarea (se completa al final).
  const judge: JudgeVerdict[] = [];
  const results: BenchResults = {
    meta: {
      timestamp: new Date().toISOString(),
      dry: opt.dry,
      ollamaHost: opt.dry ? "mock" : new URL(ollamaUrl).host,
      models: opt.models,
      tasks: opt.tasks,
      runs: opt.runs,
      inputs: inputs.map((i) => ({ id: i.id, description: i.description, hasOffer: Boolean(i.profile.jobOffer) })),
      promptVersion: PROMPT_VERSION,
      settings: TASK_SETTINGS,
      temperature: 0,
      judge: opt.judge ? (opt.dry ? "mock" : process.env.JUDGE_MODEL || "gemini-3.8-flash") : null,
      gtqPerUsd: GTQ_PER_USD,
      durationMs: Date.now() - t0,
    },
    memory,
    calls,
    judge,
  };

  if (opt.judge && opt.models.length > 1) {
    log(`\n== juez (${opt.dry ? "simulado" : process.env.JUDGE_MODEL || "gemini-3.8-flash"})`);
    await judgeMissing(results, inputs, opt.dry);
  }

  const dir = fileURLToPath(new URL("./results/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const stamp = results.meta.timestamp.replace(/[:.]/g, "-");
  const file = `${dir}${opt.dry ? "dry-" : ""}${stamp}.json`;
  writeFileSync(file, JSON.stringify(results, null, 2));
  const md = writeReport(results);
  log(`\nResultados: ${file}\nReporte:    ${md}\nDuración:   ${Math.round(results.meta.durationMs / 1000)} s`);
  await mock?.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
