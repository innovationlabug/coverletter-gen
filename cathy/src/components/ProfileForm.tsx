"use client";

import { useLayoutEffect, useRef } from "react";
import type { FormState } from "@/lib/example";
import type { FormErrors } from "@/lib/form";
import { caretAfterFormat, countDigits, formatMoneyInput } from "@/lib/money-input";

interface Props {
  form: FormState;
  errors: FormErrors;
  running: boolean;
  onChange: (f: FormState, field: keyof FormState) => void;
  onBlurField: (field: keyof FormState) => void;
  onExample: () => void;
  onSubmit: () => void;
}

type TextKey = "fullName" | "currentRole" | "currentEmployer" | "desiredRole" | "targetCompany";
type MoneyKey = "currentSalary" | "desiredSalary";

const errorId = (k: keyof FormState) => `${k}-error`;

function FieldError({ k, errors }: { k: keyof FormState; errors: FormErrors }) {
  return errors[k] ? (
    <p className="error" id={errorId(k)}>
      {errors[k]}
    </p>
  ) : null;
}

/** Monto con formato mientras se escribe ("15000" → "15,000") sin que el cursor salte al final. */
function MoneyInput({
  id,
  value,
  placeholder,
  invalid,
  onValue,
  onBlur,
}: {
  id: MoneyKey;
  value: string;
  placeholder: string;
  invalid: boolean;
  onValue: (v: string) => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && caret.current != null && document.activeElement === el) {
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);

  return (
    <input
      ref={ref}
      id={id}
      name={id}
      value={value}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      enterKeyHint="next"
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId(id) : undefined}
      onBlur={onBlur}
      onChange={(e) => {
        const raw = e.target.value;
        const pos = e.target.selectionStart ?? raw.length;
        const formatted = formatMoneyInput(raw);
        if (formatted !== raw) caret.current = caretAfterFormat(formatted, countDigits(raw.slice(0, pos)));
        onValue(formatted);
      }}
    />
  );
}

export function ProfileForm({ form, errors, running, onChange, onBlurField, onExample, onSubmit }: Props) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...form, [k]: v }, k);

  const a11y = (k: keyof FormState) => ({
    "aria-invalid": Boolean(errors[k]) || undefined,
    "aria-describedby": errors[k] ? errorId(k) : undefined,
  });

  const text = (k: TextKey, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label className="label" htmlFor={k}>
        {label}
      </label>
      <input
        id={k}
        name={k}
        value={form[k]}
        enterKeyHint="next"
        onChange={(e) => set(k, e.target.value)}
        onBlur={() => onBlurField(k)}
        {...a11y(k)}
        {...props}
      />
      <FieldError k={k} errors={errors} />
    </div>
  );

  const money = (k: MoneyKey, c: "currentCurrency" | "desiredCurrency", label: string, placeholder: string) => (
    <div className="field">
      <label className="label" htmlFor={k}>
        {label}
      </label>
      <div className="money" data-invalid={Boolean(errors[k]) || undefined}>
        <select name={c} value={form[c]} onChange={(e) => set(c, e.target.value as "GTQ" | "USD")} aria-label={`Moneda de ${label.toLowerCase()}`}>
          <option value="GTQ">Q</option>
          <option value="USD">US$</option>
        </select>
        <MoneyInput id={k} value={form[k]} placeholder={placeholder} invalid={Boolean(errors[k])} onValue={(v) => set(k, v)} onBlur={() => onBlurField(k)} />
        <span className="suffix" aria-hidden>
          al mes
        </span>
      </div>
      <FieldError k={k} errors={errors} />
    </div>
  );

  const area = (k: "achievements" | "jobOffer", label: string, hint: string, rows: number, placeholder: string) => (
    <div className="field">
      <label className="label" htmlFor={k}>
        {label}
      </label>
      <p className="hint" id={`${k}-hint`}>
        {hint}
      </p>
      <textarea
        id={k}
        name={k}
        rows={rows}
        value={form[k]}
        placeholder={placeholder}
        aria-describedby={`${k}-hint`}
        onChange={(e) => set(k, e.target.value)}
        onKeyDown={(e) => {
          // En un área de texto Enter es salto de línea; ⌘/Ctrl + Enter envía.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
    </div>
  );

  return (
    <form
      className="form"
      aria-label="Tus datos"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <div className="pair">
        {text("desiredRole", "Puesto que buscas", { autoComplete: "off" })}
        {text("targetCompany", "Empresa", { autoComplete: "off" })}
      </div>
      <div className="pair">
        {money("currentSalary", "currentCurrency", "Tu salario actual", "")}
        {money("desiredSalary", "desiredCurrency", "Salario que quieres pedir", "")}
      </div>
      <div className="field">
        <label className="label" htmlFor="yearsExperience">
          Años de experiencia
        </label>
        <input
          id="yearsExperience"
          name="yearsExperience"
          className="narrow"
          value={form.yearsExperience}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={2}
          onChange={(e) => set("yearsExperience", e.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={() => onBlurField("yearsExperience")}
          {...a11y("yearsExperience")}
        />
        <FieldError k="yearsExperience" errors={errors} />
      </div>

      <details className="more">
        <summary>Más detalles (opcional)</summary>
        <div className="more-body">
          <p className="hint more-intro">Con esto tu carta suena más a ti. Si no pones tu nombre, la carta lo deja para que lo completes.</p>
          {text("fullName", "Tu nombre", { autoComplete: "name" })}
          <div className="pair">
            {text("currentRole", "Puesto actual", { autoComplete: "organization-title" })}
            {text("currentEmployer", "Empresa actual", { autoComplete: "organization" })}
          </div>
          {area("achievements", "Logros", "Dos o tres, con números si puedes.", 3, "Automaticé 40 reportes semanales y ahorré 12 horas por semana al equipo.")}
          {area("jobOffer", "Oferta de empleo", "Pega el anuncio: la carta responderá a lo que piden.", 4, "Pega aquí el anuncio")}
        </div>
      </details>

      <div className="actions">
        <button className="primary" type="submit" disabled={running} aria-busy={running || undefined} data-testid="run">
          {running && <span className="spinner" aria-hidden />}
          {running ? "Preparando…" : "Generar carta y nota"}
        </button>
        <p className="example-line">
          ¿Quieres ver cómo funciona?{" "}
          {/* Enlace real: si se toca antes de que cargue la app, /?ejemplo lo aplica al montar. */}
          <a
            className="link"
            href="/?ejemplo"
            data-testid="load-example"
            onClick={(e) => {
              e.preventDefault();
              onExample();
            }}
          >
            Prueba con un ejemplo
          </a>
        </p>
      </div>
    </form>
  );
}
