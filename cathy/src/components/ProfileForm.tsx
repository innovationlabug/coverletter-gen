"use client";

import { useState } from "react";
import type { FormState } from "@/lib/example";
import type { FormErrors } from "@/lib/form";

interface Props {
  form: FormState;
  errors: FormErrors;
  running: boolean;
  onChange: (f: FormState) => void;
  onExample: () => void;
  onSubmit: () => void;
}

type TextKey = Exclude<keyof FormState, "currentCurrency" | "desiredCurrency">;

export function ProfileForm({ form, errors, running, onChange, onExample, onSubmit }: Props) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...form, [k]: v });
  // Los campos opcionales empiezan cerrados, salvo que ya traigan texto (p. ej., el ejemplo).
  const [showAchievements, setShowAchievements] = useState(() => Boolean(form.achievements.trim()));
  const [showOffer, setShowOffer] = useState(() => Boolean(form.jobOffer.trim()));

  const errorId = (k: keyof FormState) => `${k}-error`;
  const errorText = (k: keyof FormState) =>
    errors[k] ? (
      <span className="error" id={errorId(k)}>
        {errors[k]}
      </span>
    ) : null;

  const text = (k: TextKey, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span className="label">{label}</span>
      <input
        name={k}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={Boolean(errors[k]) || undefined}
        aria-describedby={errors[k] ? errorId(k) : undefined}
        {...props}
      />
      {errorText(k)}
    </label>
  );

  const money = (k: "currentSalary" | "desiredSalary", c: "currentCurrency" | "desiredCurrency", label: string, placeholder: string) => (
    <div className="field">
      <label className="label" htmlFor={k}>
        {label}
      </label>
      <div className="money" data-invalid={Boolean(errors[k]) || undefined}>
        <select name={c} value={form[c]} onChange={(e) => set(c, e.target.value as "GTQ" | "USD")} aria-label="Moneda">
          <option value="GTQ">Q</option>
          <option value="USD">US$</option>
        </select>
        <input
          id={k}
          name={k}
          value={form[k]}
          placeholder={placeholder}
          inputMode="decimal"
          autoComplete="off"
          onChange={(e) => set(k, e.target.value)}
          aria-invalid={Boolean(errors[k]) || undefined}
          aria-describedby={errors[k] ? errorId(k) : undefined}
        />
        <span className="suffix" aria-hidden>
          al mes
        </span>
      </div>
      {errorText(k)}
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
      <p className="form-intro">
        ¿Solo quieres ver cómo funciona?{" "}
        <button type="button" className="link" onClick={onExample} data-testid="load-example">
          Usar un ejemplo
        </button>
      </p>

      <fieldset>
        <legend>Sobre ti</legend>
        <div className="row">
          {text("fullName", "Nombre completo", { autoComplete: "name" })}
          {text("yearsExperience", "Años de experiencia", { inputMode: "numeric", autoComplete: "off", className: "narrow" })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Tu trabajo actual</legend>
        <div className="row">
          {text("currentRole", "Puesto", { autoComplete: "organization-title" })}
          {text("currentEmployer", "Empresa", { autoComplete: "organization" })}
        </div>
        {money("currentSalary", "currentCurrency", "Salario", "15,000")}
      </fieldset>

      <fieldset>
        <legend>El trabajo que buscas</legend>
        <div className="row">
          {text("desiredRole", "Puesto")}
          {text("targetCompany", "Empresa")}
        </div>
        {money("desiredSalary", "desiredCurrency", "Salario que quieres pedir", "17,500")}
      </fieldset>

      <div className="extras">
        <details open={showAchievements} onToggle={(e) => setShowAchievements(e.currentTarget.open)}>
          <summary>
            Agregar tus logros <span className="optional">recomendado</span>
          </summary>
          <label className="field">
            <span className="hint">Dos o tres, con números si los tienes. Hacen la carta mucho más convincente.</span>
            <textarea name="achievements" rows={4} value={form.achievements} onChange={(e) => set("achievements", e.target.value)} />
          </label>
        </details>
        <details open={showOffer} onToggle={(e) => setShowOffer(e.currentTarget.open)}>
          <summary>
            Pegar la oferta de empleo <span className="optional">opcional</span>
          </summary>
          <label className="field">
            <span className="hint">Pégala completa. La carta responde a sus requisitos y la nota compara lo que pides con el rango publicado.</span>
            <textarea name="jobOffer" rows={6} value={form.jobOffer} onChange={(e) => set("jobOffer", e.target.value)} />
          </label>
        </details>
      </div>

      <div className="submit">
        <button className="primary" type="submit" disabled={running} aria-busy={running || undefined} data-testid="run">
          {running ? "Generando…" : "Generar carta y nota"}
        </button>
        <p className="privacy">
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
          </svg>
          Tu salario solo se usa para tu nota privada. Nunca aparece en la carta.
        </p>
      </div>
    </form>
  );
}
