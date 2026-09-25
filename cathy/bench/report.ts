/**
 * Genera BENCHMARK.md (español) a partir de un archivo de resultados.
 *   npm run bench:report                      # último resultado real en bench/results/
 *   npm run bench:report -- bench/results/X.json
 * Con resultados --dry escribe bench/BENCHMARK.dry.md (nunca pisa el BENCHMARK.md real).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BenchResults, CallRecord } from "./run";
import type { NegotiationQuality, RequirementsQuality } from "./lib/quality";
import { NOTE_WORDS } from "./lib/quality";
import { CRITERIA } from "./lib/judge";
import { mean, percentile, ratio } from "./lib/stats";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const f = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("es-GT", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${f(n * 100, 0)} %`);
const secs = (ms: number | null | undefined) => (ms == null ? "—" : ms >= 1000 ? `${f(ms / 1000, 1)} s` : `${f(ms, 0)} ms`);
const gb = (b: number) => `${f(b / 1e9, 2)} GB`;

function table(head: string[], rows: string[][]): string {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

interface ModelSummary {
  model: string;
  latency: Record<string, { n: number; errors: number; ttftP50: number | null; totalP50: number | null; totalP95: number | null; tps: number | null; tokens: number | null }>;
  cold: CallRecord | undefined;
  neg: {
    n: number;
    spanish: number | null;
    lengthOk: number | null;
    consistent: number | null;
    invented: number;
    onTopic: number | null;
    offTopicCases: number;
    secondPerson: number | null;
    words: number | null;
    score: number | null;
  };
  req: { n: number; jsonValid: number | null; schemaValid: number | null; grounding: number | null; recall: number | null; mentionsSalary: number; score: number | null };
  judge: Record<string, Record<string, number | null>>;
  judgeAvg: number | null;
  detScore: number | null;
}

export function summarize(r: BenchResults): ModelSummary[] {
  return r.meta.models.map((model) => {
    const warm = r.calls.filter((c) => c.model === model && c.kind === "warm");
    const latency: ModelSummary["latency"] = {};
    for (const task of r.meta.tasks) {
      const all = warm.filter((c) => c.task === task);
      const ok = all.filter((c) => c.ok && c.stats);
      latency[task] = {
        n: ok.length,
        errors: all.length - ok.length,
        ttftP50: percentile(ok.map((c) => c.stats!.ttftMs ?? NaN), 50),
        totalP50: percentile(ok.map((c) => c.stats!.totalMs), 50),
        totalP95: percentile(ok.map((c) => c.stats!.totalMs), 95),
        tps: mean(ok.map((c) => c.stats!.tokensPerSecond ?? NaN)),
        tokens: mean(ok.map((c) => c.stats!.evalCount)),
      };
    }
    const negQ = warm.filter((c) => c.task === "negotiation" && c.quality).map((c) => c.quality as NegotiationQuality);
    const reqQ = warm.filter((c) => c.task === "requirements" && c.ok).map((c) => c.quality as RequirementsQuality);
    const judge: ModelSummary["judge"] = {};
    for (const task of r.meta.tasks) {
      const vs = r.judge.filter((v) => v.task === task && v.scores[model]);
      judge[task] = Object.fromEntries(CRITERIA.map((c) => [c, mean(vs.map((v) => v.scores[model][c]))]));
    }
    const allJudge = r.judge.filter((v) => v.scores[model]).flatMap((v) => CRITERIA.map((c) => v.scores[model][c]));
    const negScore = mean(negQ.map((q) => q.score));
    const reqScore = mean(reqQ.map((q) => q.score));
    return {
      model,
      latency,
      cold: r.calls.find((c) => c.model === model && c.kind === "cold"),
      neg: {
        n: negQ.length,
        spanish: ratio(negQ.map((q) => q.spanish)),
        lengthOk: ratio(negQ.map((q) => q.lengthOk)),
        consistent: ratio(negQ.map((q) => q.numbersConsistent)),
        invented: negQ.reduce((a, q) => a + q.inventedNumbers, 0),
        onTopic: ratio(negQ.map((q) => q.onTopic)),
        offTopicCases: negQ.filter((q) => q.offTopicHits.length > 0).length,
        secondPerson: ratio(negQ.map((q) => q.secondPerson !== false)),
        words: mean(negQ.map((q) => q.words)),
        score: negScore,
      },
      req: {
        n: reqQ.length,
        jsonValid: ratio(reqQ.map((q) => q.jsonValid)),
        schemaValid: ratio(reqQ.map((q) => q.schemaValid)),
        grounding: mean(reqQ.map((q) => q.grounding ?? NaN)),
        recall: mean(reqQ.map((q) => q.recall ?? NaN)),
        mentionsSalary: reqQ.filter((q) => q.mentionsSalary).length,
        score: reqScore,
      },
      judge,
      judgeAvg: mean(allJudge),
      detScore: mean([negScore ?? NaN, reqScore ?? NaN]),
    };
  });
}

function positionBias(r: BenchResults): { comparisons: number; firstWins: number; ties: number; swapped: boolean } {
  let firstWins = 0;
  let ties = 0;
  let comparisons = 0;
  const passes = r.judge.flatMap((v) => v.passes ?? [{ order: v.order, scores: v.scores, comment: v.comment }]);
  for (const p of passes) {
    const totals = p.order.map((m) => CRITERIA.reduce((a, c) => a + (p.scores[m]?.[c] ?? 0), 0));
    comparisons++;
    if (totals[0] === totals[1]) ties++;
    else if (totals[0] > totals[1]) firstWins++;
  }
  return { comparisons, firstWins, ties, swapped: r.judge.some((v) => v.passes && v.passes.length > 1) };
}

function conclusion(s: ModelSummary[], r: BenchResults): string {
  if (s.length < 2) return "_Se necesita correr al menos dos modelos para concluir._";
  const composite = (m: ModelSummary) => ((m.detScore ?? 0) + (m.judgeAvg != null ? m.judgeAvg / 5 : m.detScore ?? 0)) / 2;
  const ranked = [...s].sort((a, b) => composite(b) - composite(a) || (a.latency.negotiation?.totalP50 ?? Infinity) - (b.latency.negotiation?.totalP50 ?? Infinity));
  const [w, l] = ranked;
  const wins: string[] = [];
  const losses: string[] = [];
  const cmp = (label: string, a: number | null, b: number | null, higherIsBetter: boolean, fmt: (n: number | null) => string) => {
    if (a == null || b == null || a === b || fmt(a) === fmt(b)) return; // empate a la precisión mostrada
    const better = higherIsBetter ? a > b : a < b;
    (better ? wins : losses).push(`${label}: ${w.model} ${fmt(a)} · ${l.model} ${fmt(b)}`);
  };
  cmp("calidad determinista (0–1)", w.detScore, l.detScore, true, (n) => f(n, 2));
  cmp("promedio del juez (1–5)", w.judgeAvg, l.judgeAvg, true, (n) => f(n, 2));
  const taskJudge = (m: ModelSummary, t: string) => mean(CRITERIA.map((c) => m.judge[t]?.[c] ?? NaN));
  cmp("juez en la nota (1–5)", taskJudge(w, "negotiation"), taskJudge(l, "negotiation"), true, (n) => f(n, 2));
  cmp("juez en requisitos (1–5)", taskJudge(w, "requirements"), taskJudge(l, "requirements"), true, (n) => f(n, 2));
  cmp("notas con cifras consistentes", w.neg.consistent, l.neg.consistent, true, pct);
  cmp("notas en tema", w.neg.onTopic, l.neg.onTopic, true, pct);
  cmp("notas en segunda persona", w.neg.secondPerson, l.neg.secondPerson, true, pct);
  cmp("JSON de requisitos válido contra el esquema", w.req.schemaValid, l.req.schemaValid, true, pct);
  cmp("fidelidad de requisitos a la oferta (grounding)", w.req.grounding, l.req.grounding, true, pct);
  cmp("extracciones que metieron el salario como requisito", w.req.mentionsSalary, l.req.mentionsSalary, false, (n) => f(n, 0));
  cmp("latencia p50 de la nota", w.latency.negotiation?.totalP50 ?? null, l.latency.negotiation?.totalP50 ?? null, false, secs);
  cmp("velocidad de generación (tok/s)", w.latency.negotiation?.tps ?? null, l.latency.negotiation?.tps ?? null, true, (n) => f(n, 1));
  cmp("carga en frío", w.cold?.stats?.loadMs ?? null, l.cold?.stats?.loadMs ?? null, false, secs);
  const mw = r.memory.find((m) => m.model === w.model);
  const ml = r.memory.find((m) => m.model === l.model);
  if (mw && ml) cmp("memoria ocupada", mw.size, ml.size, false, (n) => (n == null ? "—" : gb(n)));

  // Ganador por tarea: calidad determinista de la tarea + juez de la tarea normalizado.
  const perTask = r.meta.tasks.map((t) => {
    const score = (m: ModelSummary) => {
      const det = t === "negotiation" ? m.neg.score : m.req.score;
      const j = taskJudge(m, t);
      return ((det ?? 0) + (j != null ? j / 5 : det ?? 0)) / 2;
    };
    const best = [...s].sort((a, b) => score(b) - score(a))[0];
    const label = t === "negotiation" ? "nota de negociación" : "extracción de requisitos";
    return `- **${label}** → \`${best.model}\` (${s.map((m) => `${m.model} ${f(score(m), 2)}`).join(" · ")})`;
  });
  const tie = Math.abs(composite(w) - composite(l)) < 0.02;
  const lines = [
    r.meta.dry ? "> ⚠ **Datos SIMULADOS (`--dry`)**: esta conclusión solo demuestra que el generador funciona. No la cites.\n" : "",
    tie
      ? `**Empate técnico en el agregado** (\`${w.model}\` ${f(composite(w), 3)} vs \`${l.model}\` ${f(composite(l), 3)}; compuesto = promedio de calidad determinista y juez normalizado a 0–1). La decisión depende de la tarea:`
      : `**Ganador para este caso: \`${w.model}\`** (puntaje compuesto ${f(composite(w), 2)} vs ${f(composite(l), 2)}; compuesto = promedio de calidad determinista y juez normalizado a 0–1).`,
    "",
    "**Mejor modelo por tarea:**",
    ...perTask,
    "",
    tie ? `**Dónde gana \`${w.model}\`** (hechos medidos):` : "**Por qué gana** (hechos medidos):",
    ...(wins.length ? wins.map((x) => `- ${x}`) : ["- (sin diferencias medibles a su favor)"]),
    "",
    tie ? `**Dónde gana \`${l.model}\`:**` : "**En qué pierde el ganador:**",
    ...(losses.length ? losses.map((x) => `- ${x}`) : ["- (no pierde en ninguna métrica medida)"]),
    "",
    handWrittenDecision(r.meta.dry),
  ];
  return lines.filter((x) => x !== undefined).join("\n");
}

/**
 * The numbers above are generated; the decision is not. `bench/DECISION.md` holds the
 * human interpretation of the real run so regenerating the report doesn't erase it.
 */
function handWrittenDecision(dry: boolean): string {
  if (dry) return "";
  try {
    return `### Decisión\n\n${readFileSync(`${ROOT}bench/DECISION.md`, "utf8").trim()}`;
  } catch {
    return "_Falta `bench/DECISION.md`: interpretar a mano si las diferencias importan para esta app._";
  }
}

export function renderMarkdown(r: BenchResults): string {
  const s = summarize(r);
  const modes = [...new Set(r.memory.map((m) => m.mode))];
  const modeText = modes.length ? modes.map((m) => m.toUpperCase()).join(" / ") : "desconocido";
  const bias = positionBias(r);
  const offerInputs = r.meta.inputs.filter((i) => i.hasOffer).length;

  const out: string[] = [];
  out.push(`# Benchmark: ${r.meta.models.map((m) => `\`${m}\``).join(" vs ")}${r.meta.dry ? " (SIMULADO)" : ""}`);
  out.push("");
  out.push(
    `Corrida del ${r.meta.timestamp.slice(0, 16).replace("T", " ")} UTC · Ollama en \`${r.meta.ollamaHost}\` · modo **${modeText}** (según \`size_vram\` de \`/api/ps\`) · ${r.meta.inputs.length} perfiles · ${r.meta.runs} corrida(s) tibia(s) por entrada · duró ${f(r.meta.durationMs / 60000, 1)} min.`,
  );
  if (r.meta.dry) out.push("\n> ⚠ Este archivo viene de `npm run bench -- --dry` contra un Ollama simulado. Los números **no son reales**.");
  out.push("\n## Método\n");
  out.push(
    [
      `- **Tareas de la app, no benchmarks genéricos**: (a) borrador de la nota de negociación (${r.meta.inputs.length} entradas) y (b) extracción de requisitos en JSON (${offerInputs} entradas con oferta). Los prompts salen de \`src/lib/prompts.ts\` (versión \`${r.meta.promptVersion}\`) y las opciones de \`src/lib/tasks.ts\`: lo mismo que corre en producción.`,
      "- **Mismas condiciones para ambos**: mismos mensajes, `temperature: 0`, `seed: 42`, mismo `num_predict`, `format` = JSON Schema en requisitos, `stream: true`.",
      "- **`think: false` para ambos**: Qwen 3.5 \"piensa\" por defecto (tokens de razonamiento antes de responder). Eso multiplica la latencia en CPU y, en la extracción, mete texto antes del JSON. Gemma 4 E2B no lo necesita para estas tareas. Apagarlo en los dos compara la respuesta útil, no la cadena de razonamiento; el costo es que Qwen compite sin su modo fuerte (queda anotado como sesgo).",
      "- **Frío vs tibio**: *frío* = el modelo se descarga con `keep_alive: 0` (el contenedor de Cloud Run sigue vivo) y se mide la primera llamada; *tibio* = modelo ya en memoria. El arranque del contenedor (escala a cero) suma aparte y no se mide aquí.",
      "- **Latencia**: TTFT = tiempo hasta el primer token con contenido (stream); total = reloj de pared extremo a extremo (incluye red hasta Cloud Run); tok/s = `eval_count / eval_duration` reportado por Ollama (sin red).",
      "- **Memoria**: `GET /api/ps` justo después de cargar cada modelo: `size` (total) y `size_vram` (en GPU). `size_vram = 0` ⇒ modo CPU.",
      `- **Calidad determinista** (las mismas heurísticas de la app): español, largo ${NOTE_WORDS.min}–${NOTE_WORDS.max} palabras, cifras consistentes con la brecha calculada (ninguna cifra inventada), en tema (sin \"interés compuesto\"/IVA), sin markdown y en segunda persona ("tu expectativa", no "mi expectativa"); en requisitos: JSON válido + esquema zod, *grounding* (ítems cuyas palabras están en la oferta) y *recall* (viñetas de la oferta cubiertas).`,
      `- **Juez LLM**: ${r.meta.judge ? `\`${r.meta.judge}\`` : "desactivado"} con rúbrica 1–5 (utilidad, precisión, tono, fidelidad a los datos). Ciego al nombre del modelo, orden A/B aleatorio con semilla y registrado. Juzga la corrida #1 de cada modelo.`,
    ].join("\n"),
  );

  out.push("\n### ¿Son comparables?\n");
  const memRows = r.memory.map((m) => [`\`${m.model}\``, m.parameterSize ?? "—", m.quantization ?? "—", gb(m.size)]);
  if (memRows.length) out.push(table(["Modelo", "Parámetros (Ollama)", "Cuantización", "Tamaño cargado"], memRows) + "\n");
  out.push(
    "No son simétricos: Gemma 4 **E2B** son ~2B parámetros *efectivos* por token, pero el archivo trae ~4.6B en total (embeddings por capa) cuantizados a Q4 (QAT); Qwen 3.5 2B son ~2.3B densos a Q8. Los consideramos comparables por **presupuesto de despliegue**, no por conteo de parámetros: ambos son la opción \"~2B\" que su familia publica para dispositivo/edge, ambos caben con holgura en una L4 (24 GB) o en 32 GB de RAM, y lo que importa para esta app es calidad por segundo y por GB. Por eso reportamos memoria real y velocidad, no solo el nombre.",
  );

  out.push("\n## Latencia (corridas tibias)\n");
  const latRows: string[][] = [];
  for (const m of s) {
    for (const task of r.meta.tasks) {
      const l = m.latency[task];
      if (!l) continue;
      latRows.push([`\`${m.model}\``, task === "negotiation" ? "nota" : "requisitos", String(l.n), secs(l.ttftP50), secs(l.totalP50), secs(l.totalP95), f(l.tps, 1), f(l.tokens, 0), String(l.errors)]);
    }
  }
  out.push(table(["Modelo", "Tarea", "n", "TTFT p50", "Total p50", "Total p95", "tok/s (media)", "Tokens salida", "Errores"], latRows));

  out.push("\n### Frío (modelo descargado → primera respuesta)\n");
  out.push(
    table(
      ["Modelo", "Carga del modelo", "TTFT", "Total", "tok/s"],
      s.map((m) => [`\`${m.model}\``, secs(m.cold?.stats?.loadMs), secs(m.cold?.stats?.ttftMs), secs(m.cold?.stats?.totalMs), f(m.cold?.stats?.tokensPerSecond, 1)]),
    ),
  );

  out.push("\n## Memoria\n");
  out.push(
    table(
      ["Modelo", "Modo", "size", "size_vram"],
      r.memory.map((m) => [`\`${m.model}\``, m.mode.toUpperCase(), gb(m.size), gb(m.sizeVram)]),
    ),
  );

  out.push("\n## Calidad determinista\n");
  out.push("**Nota de negociación**\n");
  out.push(
    table(
      ["Modelo", "n", "Español", "Largo OK", "Cifras consistentes", "Cifras inventadas (total)", "En tema", "2.ª persona", "Palabras (media)", "Puntaje"],
      s.map((m) => [`\`${m.model}\``, String(m.neg.n), pct(m.neg.spanish), pct(m.neg.lengthOk), pct(m.neg.consistent), String(m.neg.invented), pct(m.neg.onTopic), pct(m.neg.secondPerson), f(m.neg.words, 0), f(m.neg.score, 2)]),
    ),
  );
  out.push("\n**Requisitos (JSON)**\n");
  out.push(
    table(
      ["Modelo", "n", "JSON válido", "Esquema OK", "Grounding", "Recall", "Mencionó salario", "Puntaje"],
      s.map((m) => [`\`${m.model}\``, String(m.req.n), pct(m.req.jsonValid), pct(m.req.schemaValid), pct(m.req.grounding), pct(m.req.recall), String(m.req.mentionsSalary), f(m.req.score, 2)]),
    ),
  );

  out.push("\n## Juez LLM\n");
  if (!r.judge.length) out.push("_Sin juez en esta corrida._");
  else {
    const rows: string[][] = [];
    for (const m of s)
      for (const task of r.meta.tasks) rows.push([`\`${m.model}\``, task === "negotiation" ? "nota" : "requisitos", ...CRITERIA.map((c) => f(m.judge[task]?.[c], 2))]);
    out.push(table(["Modelo", "Tarea", ...CRITERIA], rows));
    out.push(
      `\n**Sesgos del juez.** Posición: en ${bias.comparisons} juicios${bias.swapped ? " (cada par juzgado en ambos órdenes A/B y B/A; la tabla promedia ambos)" : ""}, la respuesta mostrada primero ganó ${bias.firstWins} veces (${bias.ties} empates); si el juez fuera neutral, ~50 % de los no empatados. Otros sesgos conocidos que NO controlamos: preferencia por textos largos, y afinidad de familia (Gemini juzgando a Gemma, ambos de Google). Además el juez es el mismo modelo que escribe la carta en la app. Por eso el juez es una señal más, no el veredicto: los chequeos deterministas pesan igual en el compuesto.`,
    );
  }

  out.push("\n## Conclusión\n");
  out.push(conclusion(s, r));

  out.push("\n## Reproducir\n");
  out.push(
    [
      "```bash",
      "export OLLAMA_URL=https://ollama-coverletter-<id>.us-central1.run.app   # o http://localhost:11434",
      "gcloud auth application-default login                                    # para el juez (Vertex AI)",
      "npm run bench                                   # 3 corridas tibias + 1 fría por modelo",
      "npm run bench -- --runs 1 --inputs 6 --no-judge # corrida corta (útil en CPU)",
      "npm run bench -- --dry                          # Ollama simulado, prueba el pipeline",
      "```",
    ].join("\n"),
  );
  return out.join("\n") + "\n";
}

export function writeReport(r: BenchResults): string {
  const path = r.meta.dry ? `${ROOT}bench/BENCHMARK.dry.md` : `${ROOT}BENCHMARK.md`;
  writeFileSync(path, renderMarkdown(r));
  return path;
}

function latestResult(): string {
  const dir = `${ROOT}bench/results/`;
  const files = readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("dry-")).sort();
  if (!files.length) throw new Error("No hay resultados reales en bench/results/ (corre npm run bench)");
  return dir + files[files.length - 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? latestResult();
  const r = JSON.parse(readFileSync(file, "utf8")) as BenchResults;
  console.log(writeReport(r));
}
