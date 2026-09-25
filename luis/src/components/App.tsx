"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { generate, type GenerateResult } from "@/lib/generate";
import { EMPTY_FORM, EXAMPLE_FORM, formToProfile, validateForm, type FormErrors, type ProfileForm as Form } from "@/lib/profile";
import type { Profile } from "@/lib/types";
import { DETAIL_FIELDS, ProfileForm } from "./ProfileForm";
import { LetterSheet, PrivateNote, Working } from "./Results";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

type View = "form" | "results";

interface Run {
  id: number;
  profile: Profile;
  offline: boolean;
  result: GenerateResult | null;
  writing: boolean;
  failed: boolean;
}

/** One plain-language line when the letter could not be written by the AI. */
function fallbackNotice(run: Run): string | null {
  const r = run.result;
  if (!r || r.letter.source !== "template") return null;
  if (r.statuses.gemini.status === "blocked")
    return "Para proteger tus datos, esta carta se armó en tu dispositivo. Revísala y edítala a tu gusto.";
  if (run.offline) return "Sin conexión: te dejamos una versión base de la carta que puedes editar. Tu nota privada está completa.";
  return "No pudimos contactar al servicio; te dejamos una versión base que puedes editar.";
}

export function App() {
  const online = useOnline();
  const [view, setView] = useState<View>("form");
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const runId = useRef(0);

  // Move focus after a view change or after opening the details disclosure.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  const onChange = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const busy = !!run && !run.result && !run.failed;

  const onSubmit = async () => {
    const errs = validateForm(form);
    setErrors(errs);
    const first = Object.keys(errs)[0] as keyof Form | undefined;
    if (first) {
      if (DETAIL_FIELDS.includes(first)) setDetailsOpen(true);
      pendingFocus.current = first;
      return;
    }
    const profile = formToProfile(form);
    const id = ++runId.current;
    const offline = !navigator.onLine;
    setRun({ id, profile, offline, result: null, writing: false, failed: false });
    setView("results");
    window.scrollTo({ top: 0 });
    pendingFocus.current = "results-title";
    try {
      const result = await generate(profile, {
        onStatus: (d, info) => {
          if (d === "gemini" && info.status === "loading")
            setRun((r) => (r && r.id === id ? { ...r, writing: true } : r));
        },
      });
      setRun((r) => (r && r.id === id ? { ...r, result } : r));
    } catch {
      setRun((r) => (r && r.id === id ? { ...r, failed: true } : r));
    }
  };

  const backToForm = () => {
    setView("form");
    window.scrollTo({ top: 0 });
    pendingFocus.current = "desiredRole";
  };

  const startOver = () => {
    runId.current++;
    setForm(EMPTY_FORM);
    setErrors({});
    setDetailsOpen(false);
    setRun(null);
    backToForm();
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
  const notice = run ? fallbackNotice(run) : null;

  return (
    <div className="app">
      <header className="appbar">
        <h1 className="wordmark">Carta y copia</h1>
        {!online && (
          <p className="offline" role="status" data-testid="net">
            Sin conexión. Igual puedes crear tu nota privada y una carta base.
          </p>
        )}
      </header>

      {view === "form" && (
        <main className="intro-layout">
          <div className="intro">
            <h2 className="intro-title">
              <span>Una carta para la empresa.</span> <span>Una copia para ti.</span>
            </h2>
            <p className="intro-lead">
              Llena tus datos una vez y recibe tu carta de interés lista para enviar, más una nota privada con cuánto
              pedir de salario y cuándo decirlo.
            </p>
            <div className="sheets-art" aria-hidden="true">
              <div className="art-copy">
                <span />
                <span />
                <span />
              </div>
              <div className="art-letter">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="intro-tools">
              <p>
                ¿Quieres ver cómo funciona?{" "}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setForm(EXAMPLE_FORM);
                    setErrors({});
                    setDetailsOpen(true);
                  }}
                >
                  Llenar con un ejemplo
                </button>
              </p>
              {dirty && (
                <button type="button" className="link" onClick={startOver}>
                  Borrar datos
                </button>
              )}
            </div>
          </div>
          <div className="form-card">
            <ProfileForm
              form={form}
              errors={errors}
              busy={busy}
              detailsOpen={detailsOpen}
              onDetailsOpen={setDetailsOpen}
              onChange={onChange}
              onSubmit={onSubmit}
            />
          </div>
        </main>
      )}

      {view === "results" && run && (
        <main className="results" aria-labelledby="results-title">
          <div className="results-bar">
            <button type="button" className="back" onClick={backToForm}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
                <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Editar datos
            </button>
            <h2 id="results-title" tabIndex={-1} className="results-title">
              {run.profile.desiredRole} en {run.profile.targetCompany}
            </h2>
            <button type="button" className="link" onClick={startOver}>
              Empezar de nuevo
            </button>
          </div>

          {run.failed && (
            <div className="notice notice-error" role="alert">
              <p>No pudimos crear tu carta. Revisa tus datos e intenta de nuevo.</p>
              <button type="button" className="secondary" onClick={backToForm}>
                Volver a mis datos
              </button>
            </div>
          )}

          {notice && (
            <p className="notice" role="status" data-testid="notice">
              {notice}
            </p>
          )}

          {busy && (
            <Working
              message={run.writing ? "Escribiendo tu carta…" : `Investigando ${run.profile.targetCompany}…`}
            />
          )}

          {run.result && (
            <div className="results-grid">
              <LetterSheet key={run.id} letter={run.result.letter} />
              <PrivateNote note={run.result.note} profile={run.profile} offline={run.offline} />
            </div>
          )}
        </main>
      )}
    </div>
  );
}
