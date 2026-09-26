"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_FORM, EXAMPLE_FORM, type FormState } from "@/lib/example";
import { formToProfile, REQUIRED, type FormErrors } from "@/lib/form";
import { generate, type GenerateResult, type OrchestratorEvent } from "@/lib/orchestrator";
import { DEFAULT_MODEL, isModelId, type ModelId } from "@/lib/schemas";
import type { Profile } from "@/lib/types";
import { ProfileForm } from "./ProfileForm";
import { NoteCard, type DraftView } from "./NoteCard";
import { LetterCard } from "./LetterCard";
import { ArrowLeftIcon, CheckIcon, OfflineIcon } from "./Icons";

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

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

/** Mientras se prepara todo: el esqueleto de lo que viene, nunca una pantalla en blanco. */
function Waiting({ slow }: { slow: boolean }) {
  return (
    <div className="waiting" role="status" data-testid="waiting">
      <p className="waiting-line">
        <span className="pulse" aria-hidden />
        <span>
          Preparando tu carta y tu nota…
          {slow && <span data-testid="waking"> Puede tardar hasta un minuto la primera vez.</span>}
        </span>
      </p>
      <div className="skeleton-letter" aria-hidden>
        <span className="sk" style={{ width: "46%" }} />
        <span className="sk-gap" />
        <span className="sk" />
        <span className="sk" />
        <span className="sk" style={{ width: "92%" }} />
        <span className="sk" style={{ width: "64%" }} />
        <span className="sk-gap" />
        <span className="sk" />
        <span className="sk" style={{ width: "88%" }} />
        <span className="sk" style={{ width: "72%" }} />
      </div>
      <div className="skeleton-note" aria-hidden>
        <span className="sk sk-title" />
        <div className="sk-figures">
          <span className="sk" />
          <span className="sk" />
          <span className="sk" />
        </div>
      </div>
    </div>
  );
}

export function Lab() {
  const online = useOnline();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  // Tras el primer intento de envío, los errores se revisan mientras se escribe.
  const [attempted, setAttempted] = useState(false);
  // El modelo privado sale de OLLAMA_MODEL (vía /api/config); la UI no lo expone.
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [running, setRunning] = useState(false);
  const [slow, setSlow] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [failed, setFailed] = useState(false);
  // Tras generar, el formulario se pliega a una línea con "Editar datos".
  const [editing, setEditing] = useState(true);
  const [toast, setToast] = useState<{ id: number; text: string; ok: boolean } | null>(null);
  const [announce, setAnnounce] = useState("");
  const lastProfile = useRef<Profile | null>(null);
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((text: string, ok = true) => setToast({ id: Date.now(), text, ok }), []);

  const onEvent = useCallback((e: OrchestratorEvent) => {
    if (e.type === "ollama-phase" && e.phase === "waking") setSlow(true);
  }, []);

  /** Revisa un solo campo. Antes del primer envío no se regaña por campos vacíos, solo por formato. */
  function revalidate(next: FormState, field: keyof FormState) {
    const fieldError = formToProfile(next).errors[field];
    const show = Boolean(fieldError) && (attempted || String(next[field]).trim() !== "");
    setErrors((prev) => {
      if (show) return { ...prev, [field]: fieldError };
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  }

  function change(next: FormState, field: keyof FormState) {
    setForm(next);
    if (attempted || errors[field]) revalidate(next, field);
  }

  async function start(profile: Profile) {
    lastProfile.current = profile;
    setRunning(true);
    setSlow(false);
    setResult(null);
    setFailed(false);
    setEditing(false);
    setAnnounce("");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" }));
    try {
      const r = await generate(profile, { model, offline: !navigator.onLine, onEvent });
      setResult(r);
      setAnnounce("Listo: tu carta y tu nota privada están abajo.");
      requestAnimationFrame(() => resultsRef.current?.focus({ preventScroll: true }));
    } catch {
      // generate() no debería lanzar, pero si algo raro pasa, nada de pantallas vacías.
      setFailed(true);
      setAnnounce("No pudimos preparar tu carta.");
    } finally {
      setRunning(false);
      setSlow(false);
    }
  }

  function run() {
    setAttempted(true);
    const { profile, errors } = formToProfile(form);
    setErrors(errors);
    if (!profile) {
      const first = REQUIRED.find((k) => errors[k]) ?? Object.keys(errors)[0];
      if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    void start(profile);
  }

  function retry() {
    if (lastProfile.current) void start(lastProfile.current);
  }

  function edit() {
    setEditing(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[name="desiredRole"]')?.focus());
  }

  return (
    <main className="main" id="contenido">
      {editing ? (
        <div className="hero">
          <h1>Tu carta y cuánto pedir</h1>
          <p className="lede">Cinco datos y listo: una carta para enviar con tu CV y una nota privada para negociar tu salario.</p>
        </div>
      ) : (
        <div className="recap" data-testid="recap">
          <div className="recap-text">
            <h1 className="recap-title">{form.desiredRole.trim()}</h1>
            <p className="recap-company">{form.targetCompany.trim()}</p>
          </div>
          {!running && (
            <button type="button" className="link recap-edit" onClick={edit} data-testid="edit">
              <ArrowLeftIcon size={16} />
              Editar datos
            </button>
          )}
        </div>
      )}

      {!online && (
        <p className="offline" role="status" data-testid="offline-banner">
          <OfflineIcon />
          <span>Sin conexión. Igual puedes generar una carta básica y tus números.</span>
        </p>
      )}

      {editing && <ProfileForm form={form} errors={errors} running={running} onChange={change} onBlurField={(k) => revalidate(form, k)} onExample={loadExample} onSubmit={run} />}

      <div className="results" ref={resultsRef} tabIndex={-1} aria-label="Resultados" aria-busy={running || undefined}>
        {running && <Waiting slow={slow} />}

        {failed && !running && (
          <div className="problem" role="alert" data-testid="problem">
            <h2>No pudimos preparar tu carta</h2>
            <p>Algo falló de nuestro lado, no en lo que escribiste. Tus datos siguen aquí.</p>
            <div className="problem-actions">
              <button type="button" className="primary compact" onClick={retry}>
                Intentar de nuevo
              </button>
            </div>
          </div>
        )}

        {result && !running && (
          <>
            <LetterCard result={result} company={form.targetCompany.trim()} onToast={showToast} onRetry={retry} />
            <NoteCard note={result.note} facts={result.facts} draft={draftView(result)} />
          </>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id} data-testid="toast">
            {toast.ok && <CheckIcon size={16} />}
            {toast.text}
          </div>
        )}
      </div>
    </main>
  );
}
