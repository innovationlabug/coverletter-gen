"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_FORM, EXAMPLE_FORM, type FormState } from "@/lib/example";
import { formToProfile, type FormErrors } from "@/lib/form";
import { generate, type GenerateResult, type OrchestratorEvent } from "@/lib/orchestrator";
import { DEFAULT_MODEL, isModelId, type ModelId } from "@/lib/schemas";
import { buildPayload } from "@/lib/router";
import { computeFacts, type NegotiationFacts } from "@/lib/facts";
import { buildHeuristicNote, type HeuristicNote } from "@/lib/note";
import { ProfileForm } from "./ProfileForm";
import { NoteCard, type DraftView } from "./NoteCard";
import { LetterCard, LetterPending } from "./LetterCard";

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

interface Preview {
  facts: NegotiationFacts;
  note: HeuristicNote;
}

export function Lab() {
  const online = useOnline();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  // El modelo privado sale de OLLAMA_MODEL (vía /api/config); la UI no lo expone.
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [running, setRunning] = useState(false);
  const [slow, setSlow] = useState(false);
  const [liveDraft, setLiveDraft] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [exampleLoads, setExampleLoads] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { defaultModel?: unknown } | null) => {
        if (c && isModelId(c.defaultModel)) setModel(c.defaultModel);
      })
      .catch(() => {});
  }, []);

  const onEvent = useCallback((e: OrchestratorEvent) => {
    if (e.type === "draft-delta") setLiveDraft((d) => d + e.text);
    else if (e.type === "ollama-phase" && e.phase === "waking") setSlow(true);
  }, []);

  async function run() {
    const { profile, errors } = formToProfile(form);
    setErrors(errors);
    if (!profile) {
      const first = Object.keys(errors)[0];
      if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    // Los números son deterministas: se muestran de inmediato, antes de que responda cualquier modelo.
    const facts = computeFacts(buildPayload(profile, "device"));
    setPreview({ facts, note: buildHeuristicNote(facts) });
    setRunning(true);
    setSlow(false);
    setResult(null);
    setLiveDraft("");
    if (window.matchMedia("(max-width: 959px)").matches) {
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    try {
      setResult(await generate(profile, { model, offline: !navigator.onLine, onEvent }));
    } finally {
      setRunning(false);
      setSlow(false);
    }
  }

  const note = result?.note ?? preview?.note ?? null;
  const facts = result?.facts ?? preview?.facts ?? null;
  const draftView: DraftView | null = result
    ? result.draft
      ? {
          kind: "ready",
          text: result.draft.text,
          flagged: result.draft.consistency.flagged.map((f) => f.raw),
          offTopic: !result.draft.topic.onTopic,
        }
      : { kind: "missing", offline: result.mode === "offline" }
    : running
      ? { kind: "pending", live: liveDraft }
      : null;

  return (
    <div className="page">
      <header className="masthead">
        <p className="wordmark">Cathy</p>
        <h1>Tu carta de interés y cómo hablar de salario</h1>
        <p className="lede">
          Llena tus datos una vez. Recibes una carta lista para enviar con tu CV y una nota privada, solo para ti, con cuánto pedir y
          cuándo decirlo.
        </p>
      </header>

      {!online && (
        <p className="offline" role="status" data-testid="offline-banner">
          Sin conexión. Igual puedes generar una carta básica y tu nota con los números.
        </p>
      )}

      <main className="layout">
        <ProfileForm
          key={exampleLoads}
          form={form}
          errors={errors}
          running={running}
          onChange={setForm}
          onExample={() => {
            setForm(EXAMPLE_FORM);
            setErrors({});
            setExampleLoads((n) => n + 1);
          }}
          onSubmit={run}
        />

        <div className="results" ref={resultsRef} aria-label="Resultados">
          {!note && (
            <div className="placeholder" aria-hidden>
              <div className="placeholder-sheet">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p>Aquí aparecerá tu carta, y debajo tu nota privada.</p>
            </div>
          )}

          {running && (
            <div className="progress" role="status" data-testid="waiting">
              <p>
                <strong>Preparando tu carta y tu nota…</strong>
                {slow && <span data-testid="waking"> Puede tardar hasta un minuto la primera vez.</span>}
              </p>
              <div className="progress-bar" aria-hidden />
            </div>
          )}

          {result ? <LetterCard result={result} /> : running ? <LetterPending /> : null}
          {note && facts && draftView && <NoteCard note={note} facts={facts} draft={draftView} />}
        </div>
      </main>
    </div>
  );
}
