import type { Currency } from "./types";

/** Estado del formulario (todo texto: la persona puede escribir "Q15,000", "15k", "USD 2000"…). */
export interface FormState {
  fullName: string;
  email: string;
  phone: string;
  currentRole: string;
  currentEmployer: string;
  currentSalary: string;
  currentCurrency: Currency;
  desiredRole: string;
  desiredSalary: string;
  desiredCurrency: Currency;
  targetCompany: string;
  yearsExperience: string;
  achievements: string;
  jobOffer: string;
}

export const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  phone: "",
  currentRole: "",
  currentEmployer: "",
  currentSalary: "",
  currentCurrency: "GTQ",
  desiredRole: "",
  desiredSalary: "",
  desiredCurrency: "GTQ",
  targetCompany: "",
  yearsExperience: "",
  achievements: "",
  jobOffer: "",
};

/** Perfil ficticio de ejemplo (mismo que bench/inputs/01). */
export const EXAMPLE_FORM: FormState = {
  "fullName": "María José Castillo",
  "email": "majo.castillo@correo.gt",
  "phone": "+502 5512-3344",
  "currentRole": "Analista de datos",
  "currentEmployer": "Banco Industrial",
  "currentSalary": "Q15,000",
  "currentCurrency": "GTQ",
  "desiredRole": "Analista de BI Senior",
  "desiredSalary": "Q17,500",
  "desiredCurrency": "GTQ",
  "targetCompany": "Cervecería Centro Americana",
  "yearsExperience": "5",
  "achievements": "En Banco Industrial automaticé 40 reportes semanales con Power BI y SQL, ahorrando 12 horas por semana al equipo de riesgo. Lideré la migración del data mart de cartera a la nube.",
  "jobOffer": "Analista de BI Senior\nCervecería Centro Americana busca analista para el área comercial.\nRequisitos:\n- 4 años de experiencia en inteligencia de negocios\n- SQL avanzado y Power BI\n- Experiencia con modelos de datos dimensionales\n- Inglés intermedio (deseable)\nOfrecemos: salario de Q16,000 - Q19,000 mensuales, prestaciones de ley y seguro médico."
};
