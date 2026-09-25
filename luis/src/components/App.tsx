"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { generate, type GenerateResult } from "@/lib/generate";
import { EMPTY_FORM, EXAMPLE_FORM, formToProfile, validateForm, type FormErrors, type ProfileForm as Form } from "@/lib/profile";
import type { ApiStatusInfo, Destination, OutgoingRecord, Profile } from "@/lib/types";
import { ProfileForm } from "./ProfileForm";
import { CarbonNote, CloudManifest, LetterSheet, StatusStrip } from "./Results";

const IDLE: Record<Destination, ApiStatusInfo> = {
  tavily: { status: "idle" },
  jsearch: { status: "idle" },
  gemini: { status: "idle" },
};

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

export function App() {
  const online = useOnline();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [statuses, setStatuses] = useState(IDLE);
  const [outgoing, setOutgoing] = useState<OutgoingRecord[]>([]);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const onChange = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const onSubmit = async () => {
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(Object.keys(errs)[0])?.focus();
      return;
    }
    const p = formToProfile(form);
    setBusy(true);
    setFatal(null);
    setResult(null);
    setProfile(p);
    setStatuses(IDLE);
    setOutgoing([]);
    try {
      const r = await generate(p, {
        onStatus: (d, info) => setStatuses((s) => ({ ...s, [d]: info })),
        onOutgoing: (rec) => setOutgoing((o) => [...o, rec]),
      });
      setResult(r);
      setStatuses(r.statuses);
      setOutgoing([...r.outgoing]);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-text">
          <h1>Carta y copia</h1>
          <p>
            La carta sale hacia la empresa. La copia, tu nota de negociación, se queda en este dispositivo junto con tu
            salario.
          </p>
        </div>
        <p className={`net ${online ? "net-on" : "net-off"}`} role="status" data-testid="net">
          <span aria-hidden="true" className="net-dot" />
          {online ? "Con conexión" : "Sin conexión: carta de plantilla y nota local"}
        </p>
      </header>

      <main className="layout">
        <section className="col-form" aria-label="Tus datos">
          <ProfileForm
            form={form}
            errors={errors}
            busy={busy}
            onChange={onChange}
            onSubmit={onSubmit}
            onExample={() => {
              setForm(EXAMPLE_FORM);
              setErrors({});
            }}
            onClear={() => {
              setForm(EMPTY_FORM);
              setErrors({});
              setResult(null);
              setProfile(null);
              setOutgoing([]);
              setStatuses(IDLE);
            }}
          />
        </section>

        <section className="col-results" aria-label="Resultados">
          <StatusStrip statuses={statuses} />
          {fatal && <p className="fatal">{fatal}</p>}
          {!result && !busy && (
            <div className="empty">
              <p>
                Aquí aparecerán tres cosas: la carta lista para enviar, tu copia privada con la nota de negociación y el
                registro exacto de lo que salió a la nube.
              </p>
              <p>Los campos marcados como «se queda aquí» nunca se envían. Sin conexión igual obtienes la nota y una carta de plantilla.</p>
            </div>
          )}
          {busy && !result && <p className="working">Consultando empresa y mercado, luego escribiendo la carta…</p>}
          {result && (
            <>
              <LetterSheet letter={result.letter} />
              <CarbonNote note={result.note} />
            </>
          )}
          {profile && (result || outgoing.length > 0) && <CloudManifest outgoing={outgoing} profile={profile} />}
        </section>
      </main>
    </div>
  );
}
