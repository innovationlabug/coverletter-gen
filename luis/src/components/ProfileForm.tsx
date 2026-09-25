"use client";

import type { FormErrors, ProfileForm as Form } from "@/lib/profile";
import type { Currency } from "@/lib/types";

/** Fields that live inside the "más detalles" disclosure. */
export const DETAIL_FIELDS: (keyof Form)[] = ["achievements", "jobOffer", "currentRole", "currentEmployer", "location"];

export function LockIcon() {
  return (
    <svg aria-hidden="true" width="12" height="13" viewBox="0 0 11 12" className="lock">
      <rect x="1" y="5" width="9" height="6.5" rx="1.5" fill="currentColor" />
      <path d="M3 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

interface FieldProps {
  id: keyof Form;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
  hint?: string;
  placeholder?: string;
  inputMode?: "numeric" | "text" | "decimal";
  autoComplete?: string;
  multiline?: number;
}

function Field({ id, label, value, onChange, error, optional, hint, placeholder, inputMode, autoComplete, multiline }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name: id,
    value,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  } as const;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="optional"> (opcional)</span>}
      </label>
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {multiline ? (
        <textarea {...common} rows={multiline} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          {...common}
          inputMode={inputMode}
          autoComplete={autoComplete ?? "off"}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && (
        <p className="error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

function MoneyField({
  id,
  currencyId,
  label,
  value,
  currency,
  onValue,
  onCurrency,
  error,
}: {
  id: "currentSalary" | "desiredSalary";
  currencyId: "currentCurrency" | "desiredCurrency";
  label: string;
  value: string;
  currency: Currency;
  onValue: (v: string) => void;
  onCurrency: (c: Currency) => void;
  error?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`money${error ? " money-invalid" : ""}`}>
        <select
          id={currencyId}
          name={currencyId}
          aria-label={`Moneda: ${label.toLowerCase()}`}
          value={currency}
          onChange={(e) => onCurrency(e.target.value as Currency)}
        >
          <option value="GTQ">Q</option>
          <option value="USD">US$</option>
        </select>
        <input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err salary-note` : "salary-note"}
          onChange={(e) => onValue(e.target.value)}
        />
      </div>
      {error && (
        <p className="error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function ProfileForm({
  form,
  errors,
  busy,
  detailsOpen,
  onDetailsOpen,
  onChange,
  onSubmit,
}: {
  form: Form;
  errors: FormErrors;
  busy: boolean;
  detailsOpen: boolean;
  onDetailsOpen: (open: boolean) => void;
  onChange: <K extends keyof Form>(key: K, value: Form[K]) => void;
  onSubmit: () => void;
}) {
  const set = (k: keyof Form) => (v: string) => onChange(k, v as never);
  return (
    <form
      className="profile"
      noValidate
      aria-label="Tus datos"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <fieldset>
        <legend>El puesto</legend>
        <div className="row">
          <Field
            id="desiredRole"
            label="Puesto al que aplicas"
            value={form.desiredRole}
            onChange={set("desiredRole")}
            error={errors.desiredRole}
            placeholder="Ej. Software Engineer"
          />
          <Field
            id="targetCompany"
            label="Empresa"
            value={form.targetCompany}
            onChange={set("targetCompany")}
            error={errors.targetCompany}
            placeholder="Ej. Tigo Guatemala"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Sobre ti</legend>
        <div className="row">
          <Field
            id="name"
            label="Tu nombre"
            value={form.name}
            onChange={set("name")}
            optional
            autoComplete="name"
            placeholder="Para firmar la carta"
          />
          <Field
            id="yearsExperience"
            label="Años de experiencia"
            value={form.yearsExperience}
            onChange={set("yearsExperience")}
            inputMode="numeric"
            error={errors.yearsExperience}
            placeholder="Ej. 5"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Tu salario</legend>
        <div className="row">
          <MoneyField
            id="currentSalary"
            currencyId="currentCurrency"
            label="Salario mensual actual"
            value={form.currentSalary}
            currency={form.currentCurrency}
            onValue={set("currentSalary")}
            onCurrency={(c) => onChange("currentCurrency", c)}
            error={errors.currentSalary}
          />
          <MoneyField
            id="desiredSalary"
            currencyId="desiredCurrency"
            label="Salario mensual que buscas"
            value={form.desiredSalary}
            currency={form.desiredCurrency}
            onValue={set("desiredSalary")}
            onCurrency={(c) => onChange("desiredCurrency", c)}
            error={errors.desiredSalary}
          />
        </div>
        <p className="private-line" id="salary-note">
          <LockIcon /> Tu salario no sale de tu dispositivo: solo se usa para tu nota privada.
        </p>
      </fieldset>

      <details
        className="more"
        open={detailsOpen}
        onToggle={(e) => onDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span className="more-title">Agrega detalles para una mejor carta</span>
          <span className="more-sub">Tus logros, la oferta de trabajo y tu puesto actual. Todo opcional.</span>
        </summary>
        <div className="more-body">
          <Field
            id="achievements"
            label="Logros y fortalezas"
            value={form.achievements}
            onChange={set("achievements")}
            hint="Qué lograste y con qué impacto: proyectos, equipos, mejoras."
            multiline={4}
          />
          <Field
            id="jobOffer"
            label="Oferta de trabajo"
            value={form.jobOffer}
            onChange={set("jobOffer")}
            hint="Pega el anuncio. Si publica un rango salarial, tu nota lo toma en cuenta."
            multiline={4}
          />
          <div className="row">
            <Field
              id="currentRole"
              label="Puesto actual"
              value={form.currentRole}
              onChange={set("currentRole")}
              placeholder="Ej. Desarrolladora backend"
            />
            <Field
              id="currentEmployer"
              label="Empleador actual"
              value={form.currentEmployer}
              onChange={set("currentEmployer")}
              placeholder="Nombre de la empresa"
            />
          </div>
          <Field
            id="location"
            label="Ubicación"
            value={form.location}
            onChange={set("location")}
            error={errors.location}
            placeholder="Ciudad o país"
          />
        </div>
      </details>

      <button type="submit" className="primary" disabled={busy}>
        {busy ? "Creando tu carta…" : "Crear carta y nota"}
      </button>
    </form>
  );
}
