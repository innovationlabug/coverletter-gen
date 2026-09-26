"use client";

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

type TextKey = "fullName" | "currentRole" | "currentEmployer" | "desiredRole" | "targetCompany" | "yearsExperience";

export function ProfileForm({ form, errors, running, onChange, onExample, onSubmit }: Props) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...form, [k]: v });

  const errorId = (k: keyof FormState) => `${k}-error`;
  const invalid = (k: keyof FormState) => ({
    "aria-invalid": Boolean(errors[k]) || undefined,
    "aria-describedby": errors[k] ? errorId(k) : undefined,
  });
  const errorText = (k: keyof FormState) =>
    errors[k] ? (
      <span className="error" id={errorId(k)}>
        {errors[k]}
      </span>
    ) : null;

  const text = (k: TextKey, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label className="label" htmlFor={k}>
        {label}
      </label>
      <input id={k} name={k} value={form[k]} onChange={(e) => set(k, e.target.value)} {...invalid(k)} {...props} />
      {errorText(k)}
    </div>
  );

  const money = (k: "currentSalary" | "desiredSalary", c: "currentCurrency" | "desiredCurrency", label: string, placeholder: string) => (
    <div className="field">
      <label className="label" htmlFor={k}>
        {label}
      </label>
      <div className="money" data-invalid={Boolean(errors[k]) || undefined}>
        <select name={c} value={form[c]} onChange={(e) => set(c, e.target.value as "GTQ" | "USD")} aria-label={`Moneda: ${label.toLowerCase()}`}>
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
          {...invalid(k)}
        />
        <span className="suffix" aria-hidden>
          /mes
        </span>
      </div>
      {errorText(k)}
    </div>
  );

  const area = (k: "achievements" | "jobOffer", label: string, rows: number, placeholder: string) => (
    <div className="field">
      <label className="label" htmlFor={k}>
        {label}
      </label>
      <textarea id={k} name={k} rows={rows} value={form[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
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
        {text("desiredRole", "Puesto que buscas")}
        {text("targetCompany", "Empresa")}
      </div>
      <div className="pair">
        {money("currentSalary", "currentCurrency", "Tu salario actual", "15,000")}
        {money("desiredSalary", "desiredCurrency", "Salario que quieres pedir", "17,500")}
      </div>
      {text("yearsExperience", "Años de experiencia", { inputMode: "numeric", autoComplete: "off", className: "narrow" })}

      <details className="more">
        <summary>Más detalles (opcional)</summary>
        <div className="more-body">
          {text("fullName", "Tu nombre", { autoComplete: "name" })}
          <div className="pair">
            {text("currentRole", "Puesto actual", { autoComplete: "organization-title" })}
            {text("currentEmployer", "Empresa actual", { autoComplete: "organization" })}
          </div>
          {area("achievements", "Logros", 3, "Dos o tres, con números si puedes")}
          {area("jobOffer", "Oferta de empleo", 4, "Pega aquí el anuncio")}
        </div>
      </details>

      <button className="primary" type="submit" disabled={running} aria-busy={running || undefined} data-testid="run">
        {running ? "Generando…" : "Generar carta y nota"}
      </button>

      <p className="form-foot">
        <span>Tu salario nunca aparece en la carta.</span>
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
          Usar un ejemplo
        </a>
      </p>
    </form>
  );
}
