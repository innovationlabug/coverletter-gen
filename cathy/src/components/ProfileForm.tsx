"use client";

import type { FormState } from "@/lib/example";
import type { FormErrors } from "@/lib/form";
import type { ModelId } from "@/lib/schemas";

type TierTag = "t0" | "t1" | "t2" | "t2r";

const TAG_TEXT: Record<TierTag, string> = { t0: "T0", t1: "T1", t2: "T2", t2r: "T2*" };
const TAG_TITLE: Record<TierTag, string> = {
  t0: "Se queda en tu navegador",
  t1: "Viaja al Ollama privado (Cloud Run del dueño, IAM)",
  t2: "Viaja a Gemini tal cual",
  t2r: "Viaja a Gemini redactado (sin montos, empleador ni contacto)",
};

/** A dónde puede viajar cada campo. Es la misma allowlist de router.ts, dicha en la UI. */
const FIELD_TIERS: Record<keyof FormState, TierTag[]> = {
  fullName: ["t0", "t1", "t2"],
  email: ["t0", "t1"],
  phone: ["t0", "t1"],
  currentRole: ["t0", "t1"],
  currentEmployer: ["t0", "t1"],
  currentSalary: ["t0", "t1"],
  currentCurrency: ["t0", "t1"],
  desiredRole: ["t0", "t1", "t2r"],
  desiredSalary: ["t0", "t1"],
  desiredCurrency: ["t0", "t1"],
  targetCompany: ["t0", "t1", "t2r"],
  yearsExperience: ["t0", "t1", "t2"],
  achievements: ["t0", "t1", "t2r"],
  jobOffer: ["t0", "t1"],
};

const MODEL_META: Record<string, { label: string; meta: string }> = {
  "gemma4:e2b-it-qat": { label: "gemma4:e2b-it-qat", meta: "Gemma 4 · E2B efectivos · QAT Q4" },
  "qwen3.5:2b": { label: "qwen3.5:2b", meta: "Qwen 3.5 · 2B · Q8" },
};

function Tiers({ field }: { field: keyof FormState }) {
  return (
    <span className="tiers">
      {FIELD_TIERS[field].map((t) => (
        <span key={t} className={`tag ${t}`} title={TAG_TITLE[t]}>
          {TAG_TEXT[t]}
        </span>
      ))}
    </span>
  );
}

interface Props {
  form: FormState;
  errors: FormErrors;
  model: ModelId;
  models: readonly ModelId[];
  defaultModel: ModelId;
  running: boolean;
  onChange: (f: FormState) => void;
  onModel: (m: ModelId) => void;
  onExample: () => void;
  onSubmit: () => void;
}

export function ProfileForm({ form, errors, model, models, defaultModel, running, onChange, onModel, onExample, onSubmit }: Props) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...form, [k]: v });

  const text = (k: keyof FormState, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span className="field-label">
        {label} <Tiers field={k} />
      </span>
      <input name={k} value={String(form[k])} onChange={(e) => set(k, e.target.value as never)} aria-invalid={Boolean(errors[k])} {...props} />
      {errors[k] && <span className="err">{errors[k]}</span>}
    </label>
  );

  const money = (k: "currentSalary" | "desiredSalary", c: "currentCurrency" | "desiredCurrency", label: string) => (
    <label className="field">
      <span className="field-label">
        {label} <Tiers field={k} />
      </span>
      <span className="money-row">
        <input name={k} value={form[k]} placeholder="Q15,000 · 15k · USD 2000" inputMode="text" onChange={(e) => set(k, e.target.value)} aria-invalid={Boolean(errors[k])} />
        <select name={c} value={form[c]} onChange={(e) => set(c, e.target.value as "GTQ" | "USD")} aria-label={`Moneda de ${label.toLowerCase()}`}>
          <option value="GTQ">GTQ</option>
          <option value="USD">USD</option>
        </select>
      </span>
      {errors[k] && <span className="err">{errors[k]}</span>}
    </label>
  );

  return (
    <form
      className="sheet"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <div className="sheet-head">
        <h2>Protocolo</h2>
        <button type="button" className="btn ghost" onClick={onExample} data-testid="load-example">
          cargar ejemplo ficticio
        </button>
      </div>

      <div className="form-section">
        <h3>
          <em>01</em>Quién eres
        </h3>
        {text("fullName", "Nombre completo", { autoComplete: "name" })}
        <div className="grid-2">
          {text("email", "Correo (opcional)", { type: "email", autoComplete: "email" })}
          {text("phone", "Teléfono (opcional)", { type: "tel", autoComplete: "tel" })}
        </div>
      </div>

      <div className="form-section">
        <h3>
          <em>02</em>Hoy
        </h3>
        <div className="grid-2">
          {text("currentRole", "Puesto actual")}
          {text("currentEmployer", "Empleador actual")}
        </div>
        {money("currentSalary", "currentCurrency", "Salario actual mensual")}
      </div>

      <div className="form-section">
        <h3>
          <em>03</em>Lo que buscas
        </h3>
        <div className="grid-2">
          {text("desiredRole", "Puesto deseado")}
          {text("targetCompany", "Empresa")}
        </div>
        <div className="grid-2">
          {money("desiredSalary", "desiredCurrency", "Expectativa mensual")}
          {text("yearsExperience", "Años de experiencia", { inputMode: "numeric" })}
        </div>
      </div>

      <div className="form-section">
        <h3>
          <em>04</em>Evidencia
        </h3>
        <label className="field">
          <span className="field-label">
            Logros (2–3, con números si los tienes) <Tiers field="achievements" />
          </span>
          <textarea name="achievements" rows={4} value={form.achievements} onChange={(e) => set("achievements", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">
            Oferta de empleo (opcional, pégala completa) <Tiers field="jobOffer" />
          </span>
          <textarea name="jobOffer" rows={5} value={form.jobOffer} onChange={(e) => set("jobOffer", e.target.value)} />
          <span className="hint">De la oferta solo sus requisitos (extraídos y redactados) llegan a Gemini.</span>
        </label>
      </div>

      <div className="form-section">
        <h3>
          <em>05</em>Espécimen local (tier 1)
        </h3>
        <div className="specimens" role="radiogroup" aria-label="Modelo local">
          {models.map((m) => (
            <label key={m} className="specimen">
              <input type="radio" name="model" value={m} checked={model === m} onChange={() => onModel(m)} />
              {m === defaultModel && <span className="default">default</span>}
              <div className="name">{MODEL_META[m]?.label ?? m}</div>
              <div className="meta">{MODEL_META[m]?.meta}</div>
            </label>
          ))}
        </div>
      </div>

      <div className="actions">
        <button className="btn" type="submit" disabled={running} data-testid="run">
          {running ? "corriendo…" : "Correr experimento →"}
        </button>
        <span className="hand" style={{ fontSize: 20 }}>
          el salario nunca va a Gemini
        </span>
      </div>
    </form>
  );
}
