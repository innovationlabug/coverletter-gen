"use client";

import type { FormErrors, ProfileForm as Form } from "@/lib/profile";
import type { Currency } from "@/lib/types";

type Tag = "local" | "cleaned" | null;

function TagBadge({ tag }: { tag: Tag }) {
  if (tag === "local")
    return (
      <span className="tag tag-local" title="Este dato solo se usa en tu dispositivo">
        <LockIcon /> se queda aquí
      </span>
    );
  if (tag === "cleaned")
    return (
      <span className="tag tag-clean" title="Montos, correos, teléfonos, DPI, NIT y tu empleador se borran antes de enviarlo">
        se limpia antes de salir
      </span>
    );
  return null;
}

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
  tag?: Tag;
  hint?: string;
  placeholder?: string;
  inputMode?: "numeric" | "text" | "decimal";
  autoComplete?: string;
}

function Field({ id, label, value, onChange, error, tag = null, hint, placeholder, inputMode, autoComplete }: FieldProps) {
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <TagBadge tag={tag} />
      </div>
      <input
        id={id}
        name={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete ?? "off"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
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
  hint,
}: {
  id: "currentSalary" | "desiredSalary";
  currencyId: "currentCurrency" | "desiredCurrency";
  label: string;
  value: string;
  currency: Currency;
  onValue: (v: string) => void;
  onCurrency: (c: Currency) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <TagBadge tag="local" />
      </div>
      <div className="money">
        <select
          id={currencyId}
          name={currencyId}
          aria-label={`Moneda de ${label.toLowerCase()}`}
          value={currency}
          onChange={(e) => onCurrency(e.target.value as Currency)}
        >
          <option value="GTQ">GTQ</option>
          <option value="USD">USD</option>
        </select>
        <input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder="mensual"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onValue(e.target.value)}
        />
      </div>
      {hint && !error && <p className="hint">{hint}</p>}
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
  onChange,
  onSubmit,
  onExample,
  onClear,
}: {
  form: Form;
  errors: FormErrors;
  busy: boolean;
  onChange: <K extends keyof Form>(key: K, value: Form[K]) => void;
  onSubmit: () => void;
  onExample: () => void;
  onClear: () => void;
}) {
  const set = (k: keyof Form) => (v: string) => onChange(k, v as never);
  return (
    <form
      className="profile"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="form-tools">
        <button type="button" className="link" onClick={onExample}>
          Llenar con un ejemplo
        </button>
        <button type="button" className="link" onClick={onClear}>
          Borrar todo
        </button>
      </div>

      <fieldset>
        <legend>Sobre ti</legend>
        <div className="grid-2">
          <Field id="name" label="Tu nombre" value={form.name} onChange={set("name")} tag="local" autoComplete="name" hint="Firma la carta en tu dispositivo; no se envía." />
          <Field id="yearsExperience" label="Años de experiencia" value={form.yearsExperience} onChange={set("yearsExperience")} inputMode="numeric" error={errors.yearsExperience} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Tu trabajo actual</legend>
        <div className="grid-2">
          <Field id="currentRole" label="Puesto actual" value={form.currentRole} onChange={set("currentRole")} tag="local" placeholder="Desarrolladora backend" />
          <Field id="currentEmployer" label="Empleador actual" value={form.currentEmployer} onChange={set("currentEmployer")} tag="local" placeholder="Nombre de la empresa" />
        </div>
        <MoneyField
          id="currentSalary"
          currencyId="currentCurrency"
          label="Salario actual mensual"
          value={form.currentSalary}
          currency={form.currentCurrency}
          onValue={set("currentSalary")}
          onCurrency={(c) => onChange("currentCurrency", c)}
          error={errors.currentSalary}
        />
      </fieldset>

      <fieldset>
        <legend>El puesto que buscas</legend>
        <div className="grid-2">
          <Field id="desiredRole" label="Puesto deseado" value={form.desiredRole} onChange={set("desiredRole")} error={errors.desiredRole} placeholder="Software Engineer" />
          <Field id="targetCompany" label="Empresa destino" value={form.targetCompany} onChange={set("targetCompany")} error={errors.targetCompany} placeholder="Tigo Guatemala" />
        </div>
        <div className="grid-2">
          <Field id="location" label="Ubicación" value={form.location} onChange={set("location")} error={errors.location} placeholder="Ciudad de Guatemala, Guatemala" />
          <MoneyField
            id="desiredSalary"
            currencyId="desiredCurrency"
            label="Salario deseado"
            value={form.desiredSalary}
            currency={form.desiredCurrency}
            onValue={set("desiredSalary")}
            onCurrency={(c) => onChange("desiredCurrency", c)}
            error={errors.desiredSalary}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Contexto para la carta</legend>
        <div className="field">
          <div className="field-head">
            <label htmlFor="achievements">Logros y fortalezas</label>
            <TagBadge tag="cleaned" />
          </div>
          <textarea
            id="achievements"
            name="achievements"
            rows={4}
            value={form.achievements}
            placeholder="Qué lograste, con números de impacto (porcentajes, equipos, proyectos)."
            onChange={(e) => onChange("achievements", e.target.value)}
          />
        </div>
        <div className="field">
          <div className="field-head">
            <label htmlFor="jobOffer">Oferta de trabajo (opcional)</label>
            <TagBadge tag="cleaned" />
          </div>
          <textarea
            id="jobOffer"
            name="jobOffer"
            rows={4}
            value={form.jobOffer}
            placeholder="Pega aquí el anuncio. Si publica un rango salarial, tu nota lo usará."
            onChange={(e) => onChange("jobOffer", e.target.value)}
          />
        </div>
      </fieldset>

      <button type="submit" className="primary" disabled={busy}>
        {busy ? "Generando…" : "Generar carta y nota"}
      </button>
    </form>
  );
}
