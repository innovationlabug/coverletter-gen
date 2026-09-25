export type Currency = "GTQ" | "USD";

export interface Money {
  amount: number;
  currency: Currency;
}

/** Perfil completo tal como lo escribe la persona. Vive en el navegador (tier 0). */
export interface Profile {
  fullName: string;
  email?: string;
  phone?: string;
  currentRole: string;
  currentEmployer: string;
  currentSalary: Money;
  desiredRole: string;
  desiredSalary: Money;
  targetCompany: string;
  yearsExperience: number;
  achievements: string;
  jobOffer?: string;
}

export type Seniority = "junior" | "semi-senior" | "senior" | "lead";
export type Language = "es" | "en";
