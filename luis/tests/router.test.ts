import { describe, expect, it } from "vitest";
import { ALLOWLIST, buildCloudPayload, NEVER_SENT, SensitiveDataError, yearsToBucket } from "@/lib/router";
import { profile } from "./fixtures";

describe("allowlists", () => {
  it("tavily gets only company + role", () => {
    const { payload } = buildCloudPayload(profile(), "tavily");
    expect(payload).toEqual({ company: "Tigo Guatemala", role: "Software Engineer" });
    expect(Object.keys(payload)).toEqual([...ALLOWLIST.tavily]);
  });

  it("jsearch gets only role + location + years bucket", () => {
    const { payload } = buildCloudPayload(profile({ yearsExperience: 7 }), "jsearch");
    expect(payload).toEqual({ jobTitle: "Software Engineer", location: "Guatemala", yearsBucket: "SEVEN_TO_NINE" });
  });

  it("gemini gets role, company, years, redacted text and facts — nothing else", () => {
    const { payload } = buildCloudPayload(profile(), "gemini", {
      facts: [{ id: 1, title: "Tigo lanza 5G", url: "https://example.com/1", snippet: "Tigo anunció su red 5G." }],
    });
    expect(Object.keys(payload).sort()).toEqual([...ALLOWLIST.gemini].sort());
    expect(payload.companyFacts[0]).toEqual({ id: 1, title: "Tigo lanza 5G", snippet: "Tigo anunció su red 5G." });
    const json = JSON.stringify(payload);
    for (const k of NEVER_SENT) expect(json).not.toContain(`"${k}"`);
    expect(json).not.toContain("Ana Lucía");
    expect(json).not.toContain("Desarrolladora backend");
  });

  it("no destination ever contains salary or employer", () => {
    for (const d of ["tavily", "jsearch", "gemini"] as const) {
      const json = JSON.stringify(buildCloudPayload(profile(), d).payload);
      expect(json).not.toMatch(/15[,. ]?000|19[,. ]?000/);
      expect(json.toLowerCase()).not.toContain("banco industrial");
    }
  });
});

describe("redaction inside free text", () => {
  it("redacts salary, employer, email and phone pasted in achievements", () => {
    const p = profile({
      achievements:
        "En Banco Industrial gano Q15,000 (quince mil). Escríbanme a ana@example.com o al +502 5555-1234. Bajé costos 30 %.",
    });
    const { payload, redactions } = buildCloudPayload(p, "gemini");
    expect(payload.achievements).toBe(
      "En [empleador actual] gano [monto] (quince mil). Escríbanme a [correo] o al [teléfono]. Bajé costos 30 %.".replace(
        "(quince mil)",
        "([monto])",
      ),
    );
    expect(redactions.map((r) => r.kind).sort()).toEqual(["email", "employer", "money", "phone", "salary"].sort());
  });

  it("redacts the job offer and Tavily snippets too", () => {
    const { payload } = buildCloudPayload(
      profile({ jobOffer: "Salario Q16,000 - Q22,000. Contacto rrhh@tigo.com.gt" }),
      "gemini",
      { facts: [{ id: 1, title: "Tigo invierte $300 millones", url: "https://x.y", snippet: "Competidor de Banco Industrial" }] },
    );
    expect(payload.jobOffer).toBe("Salario [monto] - [monto]. Contacto [correo]");
    expect(payload.companyFacts[0].title).toBe("Tigo invierte [monto]");
    expect(payload.companyFacts[0].snippet).toBe("Competidor de [empleador actual]");
  });
});

describe("validator blocks residual data in structured fields", () => {
  it("salary typed into the desired role", () => {
    expect(() => buildCloudPayload(profile({ desiredRole: "Dev Q15,000" }), "tavily")).toThrow(SensitiveDataError);
  });
  it("target company equal to current employer (tavily)", () => {
    expect(() => buildCloudPayload(profile({ targetCompany: "BANCO INDUSTRIAL" }), "tavily")).toThrow(/empleador|employer/);
  });
  it("email typed into location (jsearch)", () => {
    expect(() => buildCloudPayload(profile({ location: "ana@example.com" }), "jsearch")).toThrow(SensitiveDataError);
  });
});

describe("yearsToBucket", () => {
  it.each([
    [0, "LESS_THAN_ONE"],
    [1, "ONE_TO_THREE"],
    [3, "ONE_TO_THREE"],
    [4, "FOUR_TO_SIX"],
    [9, "SEVEN_TO_NINE"],
    [14, "TEN_TO_FOURTEEN"],
    [20, "ABOVE_FIFTEEN"],
  ])("%d → %s", (y, b) => expect(yearsToBucket(y)).toBe(b));
});
