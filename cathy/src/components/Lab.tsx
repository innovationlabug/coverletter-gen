"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_FORM, EXAMPLE_FORM, type FormState } from "@/lib/example";
import { formToProfile, REQUIRED, type FormErrors } from "@/lib/form";
import { generate, type GenerateResult, type OrchestratorEvent } from "@/lib/orchestrator";
import { DEFAULT_MODEL, isModelId, type ModelId } from "@/lib/schemas";
import { ProfileForm } from "./ProfileForm";
import { NoteCard, type DraftView } from "./NoteCard";
import { LetterCard } from "./LetterCard";

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

function draftView(result: GenerateResult): DraftView {
  return result.draft
    ? {
        kind: "ready",
        text: result.draft.text,
        flagged: result.draft.consistency.flagged.map((f) => f.raw),
        offTopic: !result.draft.topic.onTopic,
      }
    : { kind: "missing", offline: result.mode === "offline" };
}

export function Lab() {
  const online = useOnline();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  // El modelo privado sale de OLLAMA_MODEL (vía /api/config); la UI no lo expone.
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [running, setRunning] = useState(false);
  const [slow, setSlow] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  // Tras generar, el formulario se pliega a una línea con "Editar datos".
  const [editing, setEditing] = useState(true);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadExample = useCallback(() => {
    setForm(EXAMPLE_FORM);
    setErrors({});
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { defaultModel?: unknown } | null) => {
        if (c && isModelId(c.defaultModel)) setModel(c.defaultModel);
      })
      .catch(() => {});
  }, []);

  // "Usar un ejemplo" es un enlace a /?ejemplo: si se tocó antes de que la app cargara, se aplica aquí.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("ejemplo")) {
      loadExample();
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [loadExample]);

  const onEvent = useCallback((e: OrchestratorEvent) => {
    if (e.type === "ollama-phase" && e.phase === "waking") setSlow(true);
  }, []);

  async function run() {
    const { profile, errors } = formToProfile(form);
    setErrors(errors);
    if (!profile) {
      const first = REQUIRED.find((k) => errors[k]) ?? Object.keys(errors)[0];
      if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setRunning(true);
    setSlow(false);
    setResult(null);
    setEditing(false);
    requestAnimationFrame(() => {
      resultsRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    try {
      setResult(await generate(profile, { model, offline: !navigator.onLine, onEvent }));
    } finally {
      setRunning(false);
      setSlow(false);
    }
  }

  function edit() {
    setEditing(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[name="desiredRole"]')?.focus());
  }

  return (
    <div className="page">
      <header className="masthead">
        <p className="wordmark">Cathy</p>
        <h1>Tu carta y cuánto pedir</h1>
        <p className="lede">Una carta para enviar con tu CV y una nota privada, solo para ti.</p>
      </header>

      {!online && (
        <p className="offline" role="status" data-testid="offline-banner">
          Sin conexión: igual puedes generar una carta básica y tu nota.
        </p>
      )}

      <main>
        {editing ? (
          <ProfileForm form={form} errors={errors} running={running} onChange={setForm} onExample={loadExample} onSubmit={run} />
        ) : (
          <p className="recap" data-testid="recap">
            <span>
              {form.desiredRole.trim()} · {form.targetCompany.trim()}
            </span>
            {!running && (
              <button type="button" className="link" onClick={edit} data-testid="edit">
                Editar datos
              </button>
            )}
          </p>
        )}

        <div className="results" ref={resultsRef} tabIndex={-1} aria-label="Resultados">
          {running && (
            <div className="waiting" role="status" data-testid="waiting">
              <p>
                Preparando tu carta y tu nota…
                {slow && <span data-testid="waking"> Puede tardar hasta un minuto la primera vez.</span>}
              </p>
              <div className="progress-bar" aria-hidden />
            </div>
          )}

          {result && (
            <>
              <LetterCard result={result} />
              <NoteCard note={result.note} facts={result.facts} draft={draftView(result)} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
