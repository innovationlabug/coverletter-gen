import type { Profile } from "@/lib/types";

export const baseProfile: Profile = {
  name: "Ana Lucía Pérez",
  currentRole: "Desarrolladora backend",
  currentEmployer: "Banco Industrial",
  currentSalary: 15000,
  currentCurrency: "GTQ",
  desiredRole: "Software Engineer",
  targetCompany: "Tigo Guatemala",
  location: "Guatemala",
  desiredSalary: 19000,
  desiredCurrency: "GTQ",
  yearsExperience: 5,
  achievements: "Migré 12 servicios a Kubernetes y bajé la latencia 40 %. Lideré un equipo de 4 personas.",
  jobOffer: "",
};

export function profile(over: Partial<Profile> = {}): Profile {
  return { ...baseProfile, ...over };
}
