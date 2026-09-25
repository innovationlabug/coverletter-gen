"use client";

export type StepState = "idle" | "active" | "done" | "error" | "skipped";

export interface PipelineState {
  heuristics: StepState;
  requirements: StepState;
  negotiation: StepState;
  letter: StepState;
  waking: boolean;
}

const LABEL: Record<StepState, string> = { idle: "en cola", active: "…", done: "listo", error: "respaldo", skipped: "omitido" };

export function Pipeline({ state, hasOffer, offline }: { state: PipelineState; hasOffer: boolean; offline?: boolean }) {
  const steps: Array<{ key: keyof Omit<PipelineState, "waking">; tier: string; tag: string; label: string }> = [
    { key: "heuristics", tier: "t0", tag: "T0", label: "Heurísticas: brecha, bandas, rango, regla de momento" },
    { key: "negotiation", tier: "t1", tag: "T1", label: "Ollama: borrador de la nota privada" },
    ...(hasOffer ? [{ key: "requirements" as const, tier: "t1", tag: "T1", label: "Ollama: requisitos de la oferta (JSON)" }] : []),
    { key: "letter", tier: "t2", tag: "T2", label: offline ? "Carta de plantilla (offline)" : "Gemini: carta con datos redactados" },
  ];
  return (
    <>
      <ol className="pipeline" data-testid="pipeline">
        {steps.map((s) => (
          <li key={s.key} className={state[s.key]}>
            <span className="state" aria-hidden />
            <span className={`tag ${s.tier}`}>{s.tag}</span>
            <span>{s.label}</span>
            <span className="eyebrow">{LABEL[state[s.key]]}</span>
          </li>
        ))}
      </ol>
      {state.waking && (
        <div className="waking" role="status" data-testid="waking">
          <strong>Despertando la GPU (~30–60 s)…</strong>
          El Ollama privado escala a cero cuando nadie lo usa (US$0 en reposo). El primer pedido arranca el contenedor y carga el modelo en
          memoria; si el servicio corre en modo CPU puede tardar hasta ~2 min. Tus datos esperan dentro del perímetro.
          <div className="thermo" style={{ marginTop: 10 }} />
        </div>
      )}
    </>
  );
}
