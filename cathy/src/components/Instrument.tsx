"use client";

import type { GenerateResult } from "@/lib/orchestrator";
import type { OllamaMemory, OllamaStats } from "@/lib/ollama-client";

function fmtMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}` : `${Math.round(ms)}`;
}
function unit(ms: number | null | undefined) {
  return ms != null && ms >= 1000 ? "s" : "ms";
}
function gb(bytes: number) {
  return (bytes / 1e9).toFixed(2);
}

function Row({ label, stats, memory }: { label: string; stats: OllamaStats | null; memory: OllamaMemory | null }) {
  if (!stats) return null;
  return (
    <>
      <div className="row-label">
        {label} · {stats.model}
        {stats.loadMs > 1000 ? " · arranque en frío" : ""}
      </div>
      <div className="readout">
        <div className="k">TTFT</div>
        <div className="v">
          {fmtMs(stats.ttftMs)}
          <small>{unit(stats.ttftMs)}</small>
        </div>
      </div>
      <div className="readout">
        <div className="k">Total</div>
        <div className="v">
          {fmtMs(stats.totalMs)}
          <small>{unit(stats.totalMs)}</small>
        </div>
      </div>
      <div className="readout">
        <div className="k">Velocidad</div>
        <div className="v">
          {stats.tokensPerSecond ? stats.tokensPerSecond.toFixed(1) : "—"}
          <small>tok/s</small>
        </div>
      </div>
      <div className="readout">
        <div className="k">Carga modelo</div>
        <div className="v">
          {fmtMs(stats.loadMs)}
          <small>{unit(stats.loadMs)}</small>
        </div>
      </div>
      <div className="readout">
        <div className="k">Tokens</div>
        <div className="v">
          {stats.evalCount}
          <small>/ {stats.promptEvalCount} in</small>
        </div>
      </div>
      {memory && (
        <div className="readout">
          <div className="k">Memoria · {memory.mode.toUpperCase()}</div>
          <div className="v">
            {gb(memory.mode === "cpu" ? memory.size : memory.sizeVram)}
            <small>GB {memory.mode === "cpu" ? "RAM" : "VRAM"}</small>
          </div>
        </div>
      )}
    </>
  );
}

export function Instrument({ result, model }: { result: GenerateResult; model: string }) {
  const hasLocal = Boolean(result.draft?.stats || result.requirements.stats);
  return (
    <section className="sheet" style={{ paddingLeft: 22 }} data-testid="instrument">
      <div className="instrument">
        <div className="title">
          <span>Instrumento · quién respondió</span>
          <span>{result.mode === "offline" ? "offline" : model}</span>
        </div>
        <div className="readouts">
          {hasLocal ? (
            <>
              <Row label="Nota (T1)" stats={result.draft?.stats ?? null} memory={result.draft?.memory ?? null} />
              <Row label="Requisitos (T1)" stats={result.requirements.stats} memory={result.requirements.memory} />
            </>
          ) : (
            <div className="row-label">Modelo local: sin respuesta · se usaron heurísticas (0 ms, 0 tokens)</div>
          )}
          <div className="row-label">Carta (T2)</div>
          <div className="readout">
            <div className="k">Modelo</div>
            <div className="v" style={{ fontSize: 15 }}>
              {result.letter.source === "gemini" ? result.letter.model : "plantilla"}
            </div>
          </div>
          <div className="readout">
            <div className="k">Latencia</div>
            <div className="v">
              {fmtMs(result.letter.latencyMs)}
              <small>{unit(result.letter.latencyMs)}</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
