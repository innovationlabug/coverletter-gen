"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generate, type GenerateResult } from "@/lib/generate";
import {
  EMPTY_FORM,
  EXAMPLE_FORM,
  formatMoneyTyping,
  formToProfile,
  validateForm,
  type FormErrors,
  type ProfileForm as Form,
} from "@/lib/profile";
import type { Profile } from "@/lib/types";
import { SiteFooter, SiteHeader } from "./Brand";
import { DETAIL_FIELDS, ProfileForm } from "./ProfileForm";
import { LetterSheet, PrivateNote, Working } from "./Results";

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
    return "Para proteger tus datos, esta carta se armó en tu dispositivo. Puedes editarla.";
  if (run.offline) return "Sin conexión: esta es una versión base de la carta que puedes editar.";
  return "No pudimos contactar al servicio; te dejamos una versión base que puedes editar.";
}

const EXAMPLE: Form = {
  ...EXAMPLE_FORM,
  currentSalary: formatMoneyTyping(EXAMPLE_FORM.currentSalary),
  desiredSalary: formatMoneyTyping(EXAMPLE_FORM.desiredSalary),
};

export function App() {
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
    document.getElementById(id)?.focus({ preventScroll: id === "results-title" });
  });

  const onChange = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  // Validate one field when you leave it — only once something was typed, so
  // tabbing through an empty form never scolds you.
  const onBlurField = useCallback(
    (key: keyof Form) => {
      if (!String(form[key]).trim()) return;
      const msg = validateForm(form)[key];
      setErrors((e) => (e[key] === msg ? e : { ...e, [key]: msg }));
    },
    [form],
  );

  const busy = !!run && !run.result && !run.failed;

  const start = async (profile: Profile) => {
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

  const onSubmit = () => {
    if (busy) return;
    const errs = validateForm(form);
    setErrors(errs);
    const first = Object.keys(errs)[0] as keyof Form | undefined;
    if (first) {
      if (DETAIL_FIELDS.includes(first)) setDetailsOpen(true);
      pendingFocus.current = first;
      return;
    }
    void start(formToProfile(form));
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
      <SiteHeader onHome={view === "results" ? backToForm : undefined} />

      {view === "form" && (
        <main className="intro view">
          <h1 className="intro-title">Carta para ellos, nota para ti.</h1>
          <p className="intro-lead">
            Tu carta de interés, lista para enviar. Y aparte, una nota privada con cuánto pedir de salario.
          </p>
          <ProfileForm
            form={form}
            errors={errors}
            busy={busy}
            detailsOpen={detailsOpen}
            onDetailsOpen={setDetailsOpen}
            onChange={onChange}
            onBlurField={onBlurField}
            onSubmit={onSubmit}
          />
          <p className="intro-tools">
            <button
              type="button"
              className="link"
              onClick={() => {
                setForm(EXAMPLE);
                setErrors({});
              }}
            >
              Llenar con un ejemplo
            </button>
            {dirty && (
              <button type="button" className="link" onClick={startOver}>
                Borrar datos
              </button>
            )}
          </p>
        </main>
      )}

      {view === "results" && run && (
        <main className="results view" aria-labelledby="results-title">
          <div className="results-bar">
            <button type="button" className="back" onClick={backToForm}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
                <path
                  d="M10 3 5 8l5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Editar datos
            </button>
            <h1 id="results-title" tabIndex={-1} className="results-title">
              {run.profile.desiredRole} · {run.profile.targetCompany}
            </h1>
          </div>

          {run.failed && (
            <div className="notice notice-error" role="alert">
              <p className="notice-title">No pudimos crear tu carta.</p>
              <p>Tus datos siguen aquí. Revisa tu conexión y vuelve a intentarlo en un momento.</p>
              <div className="notice-actions">
                <button type="button" className="secondary" onClick={() => void start(run.profile)}>
                  Intentar de nuevo
                </button>
                <button type="button" className="quiet" onClick={backToForm}>
                  Volver a mis datos
                </button>
              </div>
            </div>
          )}

          {notice && (
            <p className="notice" role="status" data-testid="notice">
              {notice}
            </p>
          )}

          {busy && <Working step={run.writing ? 2 : 1} company={run.profile.targetCompany} />}

          {run.result && (
            <div className="results-stack">
              <LetterSheet key={run.id} letter={run.result.letter} company={run.profile.targetCompany} />
              <PrivateNote note={run.result.note} profile={run.profile} offline={run.offline} />
              <p className="results-again">
                <button type="button" className="link" onClick={startOver}>
                  Empezar otra carta
                </button>
              </p>
            </div>
          )}
        </main>
      )}

      <SiteFooter />
    </div>
  );
}
