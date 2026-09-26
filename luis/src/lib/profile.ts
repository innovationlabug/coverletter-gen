import type { Currency, Profile } from "./types";

/** Raw form values (strings) as typed by the user. */
export interface ProfileForm {
  name: string;
  currentRole: string;
  currentEmployer: string;
  currentSalary: string;
  currentCurrency: Currency;
  desiredRole: string;
  targetCompany: string;
  location: string;
  desiredSalary: string;
  desiredCurrency: Currency;
  yearsExperience: string;
  achievements: string;
  jobOffer: string;
}

export const EMPTY_FORM: ProfileForm = {
  name: "",
  currentRole: "",
  currentEmployer: "",
  currentSalary: "",
  currentCurrency: "GTQ",
  desiredRole: "",
  targetCompany: "",
  location: "Guatemala",
  desiredSalary: "",
  desiredCurrency: "GTQ",
  yearsExperience: "",
  achievements: "",
  jobOffer: "",
};

export const EXAMPLE_FORM: ProfileForm = {
  name: "Ana Lucía Pérez",
  currentRole: "Desarrolladora backend",
  currentEmployer: "Banco Industrial",
  currentSalary: "15000",
  currentCurrency: "GTQ",
  desiredRole: "Software Engineer",
  targetCompany: "Tigo Guatemala",
  location: "Guatemala",
  desiredSalary: "19000",
  desiredCurrency: "GTQ",
  yearsExperience: "5",
  achievements:
    "Migré 12 servicios de pagos a Kubernetes y bajé la latencia 40 %. Lideré un equipo de 4 personas. Hoy gano Q15,000 y en Banco Industrial me ofrecieron quedarme. Escríbanme a ana.perez@example.com o al 5555-1234.",
  jobOffer:
    "Buscamos Software Engineer con 4+ años de experiencia en Java o Go, microservicios y nube. Salario: Q16,000 - Q22,000 mensuales más prestaciones de ley.",
};

/** Parse "15,000" / "15000" / "Q 15 000" typed in a numeric field. */
export function parseMoneyInput(s: string): number {
  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return Number.NaN;
  // "15,000.50" → 15000.5 ; "15.000" → 15000
  if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/[.,]/g, ""));
  return Number(cleaned.replace(/,/g, ""));
}

export type FormErrors = Partial<Record<keyof ProfileForm, string>>;

export function validateForm(f: ProfileForm): FormErrors {
  const e: FormErrors = {};
  const req = (k: keyof ProfileForm, msg: string) => {
    if (!String(f[k]).trim()) e[k] = msg;
  };
  req("desiredRole", "Escribe el puesto al que aplicas.");
  req("targetCompany", "Escribe la empresa a la que aplicas.");
  req("location", "Escribe la ciudad o el país.");
  const cur = parseMoneyInput(f.currentSalary);
  if (!(cur > 0)) e.currentSalary = "Escribe tu salario actual al mes.";
  const des = parseMoneyInput(f.desiredSalary);
  if (!(des > 0)) e.desiredSalary = "Escribe el salario que quieres al mes.";
  const years = Number(f.yearsExperience);
  if (f.yearsExperience.trim() === "" || !Number.isFinite(years) || years < 0 || years > 60) {
    e.yearsExperience = "Escribe un número entre 0 y 60.";
  }
  return e;
}

export function formToProfile(f: ProfileForm): Profile {
  return {
    name: f.name.trim(),
    currentRole: f.currentRole.trim(),
    currentEmployer: f.currentEmployer.trim(),
    currentSalary: parseMoneyInput(f.currentSalary),
    currentCurrency: f.currentCurrency,
    desiredRole: f.desiredRole.trim(),
    targetCompany: f.targetCompany.trim(),
    location: f.location.trim(),
    desiredSalary: parseMoneyInput(f.desiredSalary),
    desiredCurrency: f.desiredCurrency,
    yearsExperience: Number(f.yearsExperience),
    achievements: f.achievements,
    jobOffer: f.jobOffer,
  };
}

/**
 * Format an amount while the user types: keeps digits and one decimal point,
 * groups thousands with commas ("15000" → "15,000", "Q 1500.5" → "1,500.5").
 * `parseMoneyInput` reads the result back unchanged.
 */
export function formatMoneyTyping(raw: string): string {
  const s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  const intRaw = dot === -1 ? s : s.slice(0, dot);
  const int = intRaw.replace(/^0+(?=\d)/, "").slice(0, 9);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (dot === -1) return grouped;
  const dec = s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${grouped || "0"}.${dec}`;
}

/** Where the caret should land after formatting: after the same count of digits/dots. */
export function caretAfterFormat(raw: string, caret: number, formatted: string): number {
  const keep = raw.slice(0, caret).replace(/[^\d.]/g, "").length;
  if (keep === 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.]/.test(formatted[i])) seen++;
    if (seen === keep) return i + 1;
  }
  return formatted.length;
}
