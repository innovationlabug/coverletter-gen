import { describe, expect, it } from "vitest";
import { buildPayload, TIER_ALLOWLIST, PROFILE_FIELDS, buildThirdParty } from "@/lib/router";
import { LetterPayloadSchema } from "@/lib/schemas";
import { loadInputs } from "./fixtures/profiles";
import type { Profile } from "@/lib/types";

const profile: Profile = loadInputs()[0].profile;

describe("router: allowlists explícitas por tier", () => {
  it("las allowlists son exactamente las documentadas", () => {
    expect(TIER_ALLOWLIST.device).toEqual(PROFILE_FIELDS);
    expect(TIER_ALLOWLIST.private).toEqual(PROFILE_FIELDS);
    expect([...TIER_ALLOWLIST.third_party].sort()).toEqual(["achievements", "desiredRole", "fullName", "targetCompany", "yearsExperience"]);
  });

  it("tier 0 (device) conserva todo", () => {
    expect(buildPayload(profile, "device")).toEqual(profile);
  });

  it("tier 1 (private) lleva el perfil completo, incluido el salario (decisión documentada)", () => {
    const p = buildPayload(profile, "private");
    expect(p.profile.currentSalary).toEqual(profile.currentSalary);
    expect(p.profile.currentEmployer).toBe(profile.currentEmployer);
  });

  it("tier 2 (third_party) solo lleva las llaves permitidas", () => {
    const p = buildPayload(profile, "third_party", { requirements: ["SQL avanzado"] });
    expect(Object.keys(p).sort()).toEqual(["achievements", "desiredRole", "fullName", "language", "requirements", "seniority", "targetCompany", "yearsExperience"]);
    expect(() => LetterPayloadSchema.parse(p)).not.toThrow();
  });

  it("tier 2 nunca lleva salario, empleador actual ni contacto — aunque vengan escondidos en texto libre", () => {
    const sneaky: Profile = {
      ...profile,
      achievements: "En BANCO INDUSTRIAL gano Q15,000 (15k, quince mil). Escríbeme a majo@correo.gt o al 5512-3344.",
    };
    const { payload, findings } = buildThirdParty(sneaky, { requirements: ["Experiencia en Banco Industrial", "Pretensión: Q17,500"] });
    const json = JSON.stringify(payload);
    for (const s of ["15,000", "15k", "quince", "17,500", "Banco Industrial", "BANCO", "majo@", "5512", "salary", "currentSalary", "desiredSalary", "currentEmployer", "email", "phone"]) {
      expect(json).not.toContain(s);
    }
    expect(findings.length).toBeGreaterThanOrEqual(6);
  });

  it("un campo extra rompe el esquema estricto (nadie agrega datos por accidente)", () => {
    const p = buildPayload(profile, "third_party");
    expect(() => LetterPayloadSchema.parse({ ...p, currentSalary: profile.currentSalary })).toThrow();
  });

  it("no borra el nombre de la persona aunque coincida con el empleador", () => {
    const p = buildPayload({ ...profile, fullName: "Ana Pantaleón", currentEmployer: "Grupo Pantaleon" }, "third_party");
    expect(p.fullName).toBe("Ana Pantaleón");
  });

  it("detecta el idioma y seniority de la oferta", () => {
    const en = loadInputs().find((i) => i.id.startsWith("02"))!.profile;
    expect(buildPayload(en, "third_party")).toMatchObject({ language: "en", seniority: "senior" });
  });
});
