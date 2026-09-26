"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { caretAfterFormat, formatMoneyTyping, type FormErrors, type ProfileForm as Form } from "@/lib/profile";
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

/** Cmd/Ctrl + Enter submits from a multi-line field (plain Enter adds a line). */
function submitOnModEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

interface FieldProps {
  id: keyof Form;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  inputMode?: "numeric" | "text" | "decimal";
  autoComplete?: string;
  maxLength?: number;
  multiline?: number;
  className?: string;
}

function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  placeholder,
  inputMode,
  autoComplete,
  maxLength,
  multiline,
  className,
}: FieldProps) {
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name: id,
    value,
    placeholder,
    onBlur,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  } as const;
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          {...common}
          rows={multiline}
          onKeyDown={submitOnModEnter}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...common}
          type="text"
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete={autoComplete ?? "off"}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
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

/**
 * Currency + amount in one control. The amount is grouped as you type
 * ("15000" → "15,000") and the caret stays where you were typing.
 */
function MoneyField({
  id,
  currencyId,
  label,
  value,
  currency,
  onValue,
  onCurrency,
  onBlur,
  error,
}: {
  id: "currentSalary" | "desiredSalary";
  currencyId: "currentCurrency" | "desiredCurrency";
  label: string;
  value: string;
  currency: Currency;
  onValue: (v: string) => void;
  onCurrency: (c: Currency) => void;
  onBlur: () => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = input.current;
    if (el && caret.current !== null && document.activeElement === el) {
      el.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  }, [value]);

  // Backspace/Delete next to a comma removes the digit, not the (re-added) comma.
  const skipCommas = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const at = el.selectionStart ?? 0;
    if (at !== el.selectionEnd) return;
    if (e.key === "Backspace" && el.value[at - 1] === ",") el.setSelectionRange(at - 1, at - 1);
    if (e.key === "Delete" && el.value[at] === ",") el.setSelectionRange(at + 1, at + 1);
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`money${error ? " money-invalid" : ""}`}>
        <select
          id={currencyId}
          name={currencyId}
          aria-label={`Moneda del ${label.toLowerCase()}`}
          value={currency}
          onChange={(e) => onCurrency(e.target.value as Currency)}
        >
          <option value="GTQ">Q</option>
          <option value="USD">US$</option>
        </select>
        <input
          ref={input}
          id={id}
          name={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err salary-note` : "salary-note"}
          onKeyDown={skipCommas}
          onBlur={onBlur}
          onChange={(e) => {
            const raw = e.target.value;
            const next = formatMoneyTyping(raw);
            caret.current = caretAfterFormat(raw, e.target.selectionStart ?? raw.length, next);
            onValue(next);
          }}
        />
        <span className="money-unit" aria-hidden="true">
          al mes
        </span>
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
  onBlurField,
  onSubmit,
}: {
  form: Form;
  errors: FormErrors;
  busy: boolean;
  detailsOpen: boolean;
  onDetailsOpen: (open: boolean) => void;
  onChange: <K extends keyof Form>(key: K, value: Form[K]) => void;
  onBlurField: (key: keyof Form) => void;
  onSubmit: () => void;
}) {
  const set = (k: keyof Form) => (v: string) => onChange(k, v as never);
  const blur = (k: keyof Form) => () => onBlurField(k);
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
          onBlur={blur("desiredRole")}
          error={errors.desiredRole}
          placeholder="Ej. Analista de datos"
        />
        <Field
          id="targetCompany"
          label="Empresa"
          value={form.targetCompany}
          onChange={set("targetCompany")}
          onBlur={blur("targetCompany")}
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
            onBlur={blur("currentSalary")}
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
            onBlur={blur("desiredSalary")}
            error={errors.desiredSalary}
          />
        </div>
        <p className="hint" id="salary-note">
          Solo se usa para tu nota privada; no aparece en la carta.
        </p>
      </div>

      <Field
        id="yearsExperience"
        label="Años de experiencia"
        value={form.yearsExperience}
        onChange={(v) => onChange("yearsExperience", v.replace(/\D/g, "").slice(0, 2))}
        onBlur={blur("yearsExperience")}
        inputMode="numeric"
        maxLength={2}
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
            placeholder="Qué lograste y con qué resultado"
            multiline={3}
          />
          <Field
            id="jobOffer"
            label="Oferta de trabajo"
            value={form.jobOffer}
            onChange={set("jobOffer")}
            placeholder="Pega aquí el anuncio"
            multiline={3}
          />
          <div className="row">
            <Field
              id="currentRole"
              label="Puesto actual"
              value={form.currentRole}
              onChange={set("currentRole")}
              autoComplete="organization-title"
            />
            <Field
              id="currentEmployer"
              label="Empleador actual"
              value={form.currentEmployer}
              onChange={set("currentEmployer")}
              autoComplete="organization"
            />
          </div>
          <Field
            id="location"
            label="Ubicación"
            value={form.location}
            onChange={set("location")}
            onBlur={blur("location")}
            error={errors.location}
            autoComplete="address-level2"
            placeholder="Ciudad o país"
          />
        </div>
      </details>

      <button type="submit" className="primary" disabled={busy} aria-busy={busy || undefined}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" /> Creando…
          </>
        ) : (
          "Crear carta y nota"
        )}
      </button>
    </form>
  );
}
