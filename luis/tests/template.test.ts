import { describe, expect, it } from "vitest";
import { applySignature } from "@/lib/generate";
import { buildTemplateLetter } from "@/lib/template";
import { profile } from "./fixtures";

describe("template letter", () => {
  it("builds a complete Spanish letter from form fields", () => {
    const { text, source } = buildTemplateLetter(profile(), new Date("2026-09-25T12:00:00Z"));
    expect(source).toBe("template");
    expect(text).toMatch(/^Guatemala, 25 de septiembre de 2026/);
    expect(text).toContain("Estimado equipo de selección de Tigo Guatemala:");
    expect(text).toContain("puesto de Software Engineer");
    expect(text).toContain("5 años de experiencia");
    expect(text).toContain("Desarrolladora backend");
    expect(text.trim().endsWith("Ana Lucía Pérez")).toBe(true);
  });

  it("never includes salary, employer, emails or phones from free text", () => {
    const { text } = buildTemplateLetter(
      profile({
        achievements: "Bajé costos 30 %. En Banco Industrial gano Q15,000. Escríbanme a ana@x.com. Lideré 4 personas.",
      }),
    );
    expect(text).toContain("bajé costos 30 %");
    expect(text).toContain("Lideré 4 personas.");
    expect(text).not.toMatch(/15,000|Banco Industrial|ana@x\.com/);
  });

  it("works with minimal data", () => {
    const { text } = buildTemplateLetter(profile({ achievements: "", currentRole: "", name: "", yearsExperience: 0 }));
    expect(text).toContain("menos de un año de experiencia");
    expect(text).toContain("[Tu nombre]");
  });
});

describe("applySignature", () => {
  it("replaces the token locally", () => {
    expect(applySignature("Atentamente,\n[[FIRMA]]", "Ana")).toBe("Atentamente,\nAna");
  });
  it("appends the name when the model forgot the token", () => {
    expect(applySignature("Atentamente,", "Ana")).toBe("Atentamente,\n\nAna");
  });
});
