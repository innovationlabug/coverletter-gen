"use client";

import type { FormErrors, ProfileForm as Form } from "@/lib/profile";
import type { Currency } from "@/lib/types";

/** Fields that live inside the "Más detalles" disclosure. */
export const DETAIL_FIELDS: (keyof Form)[] = [
  "name",
  "achievements",
  "jobOffer",
  "currentRole",
  "currentEmployer",
  "location",
];

export function LockIcon() {
  return (
    <svg aria-hidden="true" width="11" height="12" viewBox="0 0 11 12" className="lock">
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
  placeholder?: string;
  inputMode?: "numeric" | "text" | "decimal";
  autoComplete?: string;
  multiline?: number;
  className?: string;
}

function Field({ id, label, value, onChange, error, placeholder, inputMode, autoComplete, multiline, className }: FieldProps) {
  const common = {
    id,
    name: id,
    value,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-err` : undefined,
  } as const;
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id}>{label}</label>
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
          placeholder="al mes"
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
      <div className="row">
        <Field
          id="desiredRole"
          label="Puesto al que aplicas"
          value={form.desiredRole}
          onChange={set("desiredRole")}
          error={errors.desiredRole}
          placeholder="Ej. Analista de datos"
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

      <div className="salary">
        <div className="row">
          <MoneyField
            id="currentSalary"
            currencyId="currentCurrency"
            label="Salario actual"
            value={form.currentSalary}
            currency={form.currentCurrency}
            onValue={set("currentSalary")}
            onCurrency={(c) => onChange("currentCurrency", c)}
            error={errors.currentSalary}
          />
          <MoneyField
            id="desiredSalary"
            currencyId="desiredCurrency"
            label="Salario que quieres"
            value={form.desiredSalary}
            currency={form.desiredCurrency}
            onValue={set("desiredSalary")}
            onCurrency={(c) => onChange("desiredCurrency", c)}
            error={errors.desiredSalary}
          />
        </div>
        <p className="private-line" id="salary-note">
          <LockIcon /> Tu salario no sale de tu dispositivo.
        </p>
      </div>

      <Field
        id="yearsExperience"
        label="Años de experiencia"
        value={form.yearsExperience}
        onChange={set("yearsExperience")}
        inputMode="numeric"
        error={errors.yearsExperience}
        placeholder="Ej. 5"
        className="field-short"
      />

      <details
        className="more"
        open={detailsOpen}
        onToggle={(e) => onDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>Más detalles (opcional)</summary>
        <div className="more-body">
          <Field
            id="name"
            label="Tu nombre"
            value={form.name}
            onChange={set("name")}
            autoComplete="name"
            placeholder="Para firmar la carta"
          />
          <Field
            id="achievements"
            label="Logros"
            value={form.achievements}
            onChange={set("achievements")}
            placeholder="Qué lograste y con qué impacto"
            multiline={3}
          />
          <Field
            id="jobOffer"
            label="Oferta de trabajo"
            value={form.jobOffer}
            onChange={set("jobOffer")}
            placeholder="Pega el anuncio"
            multiline={3}
          />
          <div className="row">
            <Field
              id="currentRole"
              label="Puesto actual"
              value={form.currentRole}
              onChange={set("currentRole")}
            />
            <Field
              id="currentEmployer"
              label="Empleador actual"
              value={form.currentEmployer}
              onChange={set("currentEmployer")}
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
        {busy ? "Creando…" : "Crear carta y nota"}
      </button>
    </form>
  );
}
