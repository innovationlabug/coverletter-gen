import { describe, expect, it } from "vitest";
import { buildTemplateLetter } from "@/lib/template";
import { buildPayload } from "@/lib/router";
import { computeFacts, numberReference } from "@/lib/facts";
import { buildHeuristicNote } from "@/lib/note";
import { checkNumberConsistency } from "@/lib/heuristics/consistency";
import { parseRequirements } from "@/lib/tasks";
import { negotiationMessages } from "@/lib/prompts";
import { loadInputs } from "./fixtures/profiles";

const inputs = loadInputs();
const byId = (p: string) => inputs.find((i) => i.id.startsWith(p))!.profile;

describe("carta de plantilla (offline)", () => {
  it("español: nombre, empresa, rol y sin marcadores", () => {
    const text = buildTemplateLetter(buildPayload(byId("01"), "third_party", { requirements: ["SQL avanzado", "Power BI"] }));
    expect(text).toMatch(/^Estimado equipo de Cervecería Centro Americana:/);
    expect(text).toContain("Analista de BI Senior");
    expect(text).toContain("sql avanzado y power bi");
    expect(text).toMatch(/María José Castillo$/);
    expect(text).not.toMatch(/\[|\]/);
    expect(text).not.toContain("Banco Industrial");
  });
  it("inglés si la oferta está en inglés", () => {
    expect(buildTemplateLetter(buildPayload(byId("12"), "third_party"))).toMatch(/^Dear Applaudo hiring team,/);
  });
});

describe("hechos + nota heurística", () => {
  it("rango 'k' dentro y regla range-covers", () => {
    const f = computeFacts(byId("10"));
    expect(f.offerRange).toMatchObject({ min: 13000, max: 16000 });
    expect(f.desiredVsRange).toBe("within");
    expect(f.timing.id).toBe("range-covers");
  });
  it("oferta anual en USD → mensual en GTQ", () => {
    const f = computeFacts(byId("12"));
    expect(f.offerRange).toMatchObject({ period: "year", currency: "USD" });
    expect(f.desiredVsRange).toBe("within");
  });
  it("la nota tiene cifras deterministas", () => {
    const n = buildHeuristicNote(computeFacts(byId("06")));
    expect(n.figures.find((x) => x.label === "Brecha")?.value).toBe("+50 %");
    expect(n.rangeNote).toContain("por encima del tope");
  });
  it("el prompt de negociación lleva los mismos números que valida el chequeo", () => {
    const p = byId("01");
    const f = computeFacts(p);
    const prompt = negotiationMessages(p, f)[1].content;
    expect(checkNumberConsistency(prompt.split("- Logros")[0], numberReference(f)).ok).toBe(true);
  });
});

describe("regresión: cifras que escribió la persona no son 'inventadas'", () => {
  it("el 4 % de los logros de la ingeniera se acepta; un 12 % nuevo no", () => {
    const p = byId("06");
    const ref = numberReference(computeFacts(p), [p.achievements, p.jobOffer]);
    expect(checkNumberConsistency("Entregaste 3 torres 4% bajo presupuesto.", ref).ok).toBe(true);
    expect(checkNumberConsistency("Pide un 12 % adicional.", ref).ok).toBe(false);
  });
});

describe("parseo de requisitos del modelo", () => {
  it("acepta JSON válido y con fences", () => {
    expect(parseRequirements('```json\n{"must":["a"],"nice":[],"keywords":[]}\n```').schemaValid).toBe(true);
  });
  it("distingue JSON inválido de esquema inválido", () => {
    expect(parseRequirements("no json")).toMatchObject({ jsonValid: false, schemaValid: false });
    expect(parseRequirements('{"must":"a"}')).toMatchObject({ jsonValid: true, schemaValid: false });
  });
});
