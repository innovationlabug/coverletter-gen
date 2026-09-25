"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_FORM, EXAMPLE_FORM, type FormState } from "@/lib/example";
import { formToProfile, type FormErrors } from "@/lib/form";
import { generate, type GenerateResult, type OrchestratorEvent } from "@/lib/orchestrator";
import { DEFAULT_MODEL, MODELS, isModelId, type ModelId } from "@/lib/schemas";
import { ProfileForm } from "./ProfileForm";
import { Pipeline, type PipelineState } from "./Pipeline";
import { NoteCard } from "./NoteCard";
import { LetterCard } from "./LetterCard";
import { TierPanel } from "./TierPanel";
import { Instrument } from "./Instrument";
import { Logo, EmptyFlask } from "./Art";

interface AppConfig {
  defaultModel: ModelId;
  ollamaConfigured: boolean;
  ollamaKind: "cloud-run" | "local" | "none";
  geminiModel: string;
}

const INITIAL_PIPELINE: PipelineState = { heuristics: "idle", requirements: "idle", negotiation: "idle", letter: "idle", waking: false };

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function Lab() {
  const online = useOnline();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [running, setRunning] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_PIPELINE);
  const [liveDraft, setLiveDraft] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: AppConfig | null) => {
        if (!c) return;
        setConfig(c);
        if (isModelId(c.defaultModel)) setModel(c.defaultModel);
      })
      .catch(() => {});
  }, []);

  const onEvent = useCallback((e: OrchestratorEvent) => {
    if (e.type === "draft-delta") setLiveDraft((d) => d + e.text);
    else if (e.type === "stage") {
      setPipeline((p) => {
        const next = { ...p };
        if (e.stage === "heuristics") next.heuristics = "done";
        if (e.stage === "letter") next.letter = "active";
        return next;
      });
    } else if (e.type === "ollama-phase") {
      setPipeline((p) => {
        const next = { ...p };
        const map = { connecting: "active", waking: "active", generating: "active", done: "done", error: "error" } as const;
        next[e.task] = map[e.phase];
        if (e.phase === "waking") next.waking = true;
        if (e.phase === "generating" || e.phase === "done" || e.phase === "error") next.waking = false;
        return next;
      });
    }
  }, []);

  async function run() {
    const { profile, errors } = formToProfile(form);
    setErrors(errors);
    if (!profile) return;
    setRunning(true);
    setResult(null);
    setLiveDraft("");
    setPipeline({ ...INITIAL_PIPELINE, heuristics: "active" });
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const r = await generate(profile, { model, offline: !navigator.onLine, onEvent });
      setResult(r);
      setPipeline((p) => ({
        ...p,
        heuristics: "done",
        requirements: r.mode === "offline" ? "skipped" : profile.jobOffer ? (r.requirements.source === "ollama" ? "done" : "error") : "skipped",
        negotiation: r.mode === "offline" ? "skipped" : r.draft ? "done" : "error",
        letter: r.letter.source === "gemini" ? "done" : r.mode === "offline" ? "skipped" : "error",
        waking: false,
      }));
    } finally {
      setRunning(false);
    }
  }

  const ollamaChip = !config ? "Ollama: …" : config.ollamaKind === "cloud-run" ? "Ollama · Cloud Run privado (IAM)" : config.ollamaKind === "local" ? "Ollama · local" : "Ollama · sin configurar";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>Cathy · modelos locales</span>
        </div>
        <div className="chips">
          <span className="chip" data-testid="net-chip">
            <span className={`dot ${online ? "" : "off"}`} /> {online ? "En línea" : "Sin conexión"}
          </span>
          <span className="chip">
            <span className={`dot ${config?.ollamaConfigured ? "" : "idle"}`} /> {ollamaChip}
          </span>
          <span className="chip">
            <span className="dot" style={{ background: "var(--t2)" }} /> {config?.geminiModel ?? "gemini-3.8-flash"} · Vertex AI
          </span>
        </div>
      </header>

      <section className="masthead">
        <div>
          <h1>
            Carta dividida<span>EXP. 07</span>
          </h1>
          <p>
            Cuéntale todo — incluso cuánto ganas hoy. Las cuentas se hacen en tu navegador, el borrador de negociación lo escribe un modelo
            pequeño en una nube privada, y a Gemini solo le llega lo que una carta necesita, ya redactado.
          </p>
        </div>
        <div className="exp-card" aria-label="Leyenda de tiers">
          <div>
            <b>Protocolo</b> · tres tiers de confianza
          </div>
          <div className="tier-legend">
            <span className="tag t0">T0 navegador</span>
            <span className="tag t1">T1 Ollama privado</span>
            <span className="tag t2">T2 Gemini</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span className="tag t2r">T2*</span> = viaja redactado
          </div>
        </div>
      </section>

      {!online && (
        <div className="offline-banner" role="status" data-testid="offline-banner">
          <span className="dot off" /> Sin conexión · modo heurístico: la nota usa solo reglas locales y la carta sale de una plantilla determinista.
        </div>
      )}

      <div className="layout">
        <div>
          <ProfileForm
            form={form}
            errors={errors}
            model={model}
            models={MODELS}
            defaultModel={config?.defaultModel ?? DEFAULT_MODEL}
            running={running}
            onChange={setForm}
            onModel={setModel}
            onExample={() => {
              setForm(EXAMPLE_FORM);
              setErrors({});
            }}
            onSubmit={run}
          />
        </div>

        <div ref={resultsRef} style={{ scrollMarginTop: 16 }}>
          {!running && !result && (
            <div className="sheet empty">
              <div>
                <EmptyFlask />
                <div className="hand">sin observaciones todavía</div>
                <p className="note-small">Llena el protocolo (o carga el ejemplo) y corre el experimento.</p>
              </div>
            </div>
          )}

          {(running || result) && (
            <div className="sheet">
              <div className="sheet-head">
                <h2>Corrida</h2>
                <span className="eyebrow">{result ? (result.mode === "offline" ? "modo offline" : "completada") : "en curso…"}</span>
              </div>
              <Pipeline state={pipeline} hasOffer={Boolean(form.jobOffer.trim())} offline={result?.mode === "offline"} />
            </div>
          )}

          {result && (
            <>
              <NoteCard result={result} />
              <LetterCard result={result} />
              <Instrument result={result} model={model} />
              <TierPanel result={result} />
            </>
          )}

          {running && liveDraft && !result && (
            <div className="sheet">
              <div className="sheet-head">
                <h2>Borrador en vivo</h2>
                <span className="tag t1">T1 · {model}</span>
              </div>
              <div className="draft">
                <div className="draft-text caret">{liveDraft}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        <span>Cathy · coverletter-gen · los números salen de heurísticas, nunca del modelo.</span>
        <span>T0 navegador · T1 Cloud Run privado · T2 Vertex AI</span>
      </footer>
    </div>
  );
}
