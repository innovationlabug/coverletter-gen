import type { Profile } from "./types";
import type { FormState } from "./example";
import { parseMoney } from "./heuristics/money";

export type FormErrors = Partial<Record<keyof FormState, string>>;

const REQUIRED: Array<keyof FormState> = ["fullName", "currentRole", "currentEmployer", "currentSalary", "desiredRole", "desiredSalary", "targetCompany", "yearsExperience"];

/** Formulario → Profile. Los montos se interpretan con la misma heurística que el redactor. */
export function formToProfile(form: FormState): { profile: Profile | null; errors: FormErrors } {
  const errors: FormErrors = {};
  for (const k of REQUIRED) if (!String(form[k]).trim()) errors[k] = "Falta este dato";
  const current = form.currentSalary.trim() ? parseMoney(form.currentSalary, form.currentCurrency) : null;
  const desired = form.desiredSalary.trim() ? parseMoney(form.desiredSalary, form.desiredCurrency) : null;
  if (form.currentSalary.trim() && !current) errors.currentSalary = "Escribe el monto así: 15,000 o 15k";
  if (form.desiredSalary.trim() && !desired) errors.desiredSalary = "Escribe el monto así: 17,500 o 17.5k";
  const years = Number(form.yearsExperience);
  if (form.yearsExperience.trim() && (!Number.isInteger(years) || years < 0 || years > 60)) errors.yearsExperience = "Escribe un número entre 0 y 60";
  if (Object.keys(errors).length || !current || !desired) return { profile: null, errors };
  const profile: Profile = {
    fullName: form.fullName.trim(),
    currentRole: form.currentRole.trim(),
    currentEmployer: form.currentEmployer.trim(),
    // Si el texto trae moneda explícita ("USD 2000") gana sobre el selector.
    currentSalary: current,
    desiredRole: form.desiredRole.trim(),
    desiredSalary: desired,
    targetCompany: form.targetCompany.trim(),
    yearsExperience: years,
    achievements: form.achievements.trim(),
  };
  if (form.jobOffer.trim()) profile.jobOffer = form.jobOffer.trim();
  return { profile, errors };
}
