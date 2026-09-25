import { describe, expect, it } from "vitest";
import {
  GTQ_PER_USD,
  toGTQ,
  parseMoney,
  findMoneyMentions,
  parseNumber,
  redact,
  findResidual,
  salaryGap,
  bandFor,
  extractSalaryRange,
  offerAsksExpectation,
  whenToMention,
  TIMING_RULES,
  detectLanguage,
  detectSeniority,
  extractRequirementsHeuristic,
  checkNumberConsistency,
} from "@/lib/heuristics";

describe("money: parseo en todos los formatos", () => {
  const cases: Array<[string, number, "GTQ" | "USD"]> = [
    ["Q15,000", 15000, "GTQ"],
    ["Q 15 000", 15000, "GTQ"],
    ["15000", 15000, "GTQ"],
    ["15.000", 15000, "GTQ"],
    ["Q15,000.00", 15000, "GTQ"],
    ["$2,000", 2000, "USD"],
    ["USD 2000", 2000, "USD"],
    ["US$2,500", 2500, "USD"],
    ["15 mil", 15000, "GTQ"],
    ["15k", 15000, "GTQ"],
    ["15 mil quetzales", 15000, "GTQ"],
    ["2000 dólares", 2000, "USD"],
    ["quince mil", 15000, "GTQ"],
    ["veinticinco mil quetzales", 25000, "GTQ"],
  ];
  it.each(cases)("%s → %d %s", (input, amount, currency) => {
    expect(parseMoney(input)).toEqual({ amount, currency });
  });

  it("parseNumber distingue miles de decimales", () => {
    expect(parseNumber("15,000.50")).toBe(15000.5);
    expect(parseNumber("15,5")).toBe(15.5);
    expect(parseNumber("1.234.567")).toBe(1234567);
  });

  it("no confunde años, porcentajes ni números chicos con dinero", () => {
    const m = findMoneyMentions("En 2019 crecí 30% y 5 años después lideré 12 personas.").filter((x) => x.isMoney);
    expect(m).toEqual([]);
  });
});

describe("redactor", () => {
  const ctx = { employer: "Banco Industrial, S.A.", knownAmounts: [15000, 18000] };

  it.each([
    "Q15,000",
    "Q 15 000",
    "15000",
    "$2,000",
    "USD 2000",
    "15 mil",
    "15k",
    "quince mil quetzales",
  ])("redacta el monto %s", (form) => {
    const r = redact(`Mi salario es ${form} al mes.`, ctx);
    expect(r.text).toContain("[MONTO]");
    expect(r.text).not.toMatch(/\d{2}/);
  });

  it("redacta un monto conocido aunque parezca año", () => {
    const r = redact("Pido 2000 como mínimo", { knownAmounts: [2000] });
    expect(r.text).toBe("Pido [MONTO] como mínimo");
    expect(redact("Me gradué en 2000").text).toBe("Me gradué en 2000");
  });

  it("redacta correos, teléfonos GT, DPI y NIT", () => {
    const text = "Escríbeme a ana.lopez@correo.com o al +502 5555-1234 / 2233 4455. DPI 2456 78901 0101, NIT 1234567-8.";
    const r = redact(text);
    expect(r.text).toBe("Escríbeme a [CORREO] o al [TELÉFONO] / [TELÉFONO]. DPI [DPI], [NIT].");
    expect(r.findings.map((f) => f.kind).sort()).toEqual(["dpi", "email", "nit", "phone", "phone"]);
  });

  it("DPI de 13 dígitos corridos y NIT con K", () => {
    expect(redact("2456789010101").text).toBe("[DPI]");
    expect(redact("mi nit es 123456-K").text).toBe("mi nit es [NIT]");
  });

  it("redacta el empleador actual sin importar mayúsculas, tildes ni sufijo legal", () => {
    const r = redact("Trabajo en BANCO industrial y antes en banco  Industrial de Occidente", ctx);
    expect(r.text).toBe("Trabajo en [EMPLEADOR_ACTUAL] y antes en [EMPLEADOR_ACTUAL] de Occidente");
    const r2 = redact("Soy analista en Tígo Guatemala", { employer: "tigo guatemala" });
    expect(r2.text).toBe("Soy analista en [EMPLEADOR_ACTUAL]");
  });

  it("no redacta porcentajes, años ni cantidades pequeñas (son logros útiles)", () => {
    const t = "Reduje 30% los tiempos en 2023 con un equipo de 8 personas.";
    expect(redact(t, ctx).text).toBe(t);
  });

  it("residuo: palabras de moneda sueltas se detectan", () => {
    expect(findResidual("Gano muchos quetzales").map((f) => f.kind)).toEqual(["currency_word"]);
    expect(findResidual("Lideré la migración a la nube")).toEqual([]);
  });
});

describe("tipo de cambio y brecha", () => {
  it("constante documentada", () => {
    expect(GTQ_PER_USD).toBe(7.7);
    expect(toGTQ(1000, "USD")).toBe(7700);
  });

  it("brecha % y bandas", () => {
    expect(salaryGap({ amount: 15000, currency: "GTQ" }, { amount: 18000, currency: "GTQ" })).toMatchObject({ pct: 20, band: "ambicioso" });
    expect(salaryGap({ amount: 10000, currency: "GTQ" }, { amount: 11500, currency: "GTQ" }).band).toBe("razonable");
    expect(salaryGap({ amount: 10000, currency: "GTQ" }, { amount: 9000, currency: "GTQ" }).band).toBe("recorte");
    expect(salaryGap({ amount: 10000, currency: "GTQ" }, { amount: 10500, currency: "GTQ" }).band).toBe("conservador");
    expect(bandFor(35).band).toBe("agresivo");
  });

  it("compara monedas distintas normalizando a GTQ", () => {
    const g = salaryGap({ amount: 15400, currency: "GTQ" }, { amount: 2500, currency: "USD" });
    expect(g.desiredGTQ).toBe(19250);
    expect(g.pct).toBe(25);
  });
});

describe("rango salarial de la oferta", () => {
  it.each([
    ["Salario: Q8,000 - Q10,000 mensuales", 8000, 10000, "GTQ"],
    ["Ofrecemos entre Q12,000 y Q14,500 más prestaciones", 12000, 14500, "GTQ"],
    ["Rango: 8-10k", 8000, 10000, "GTQ"],
    ["We offer $1,500–$2,000 per month", 1500, 2000, "USD"],
    ["Salary range: USD 2000 to 2500", 2000, 2500, "USD"],
  ])("%s", (text, min, max, currency) => {
    expect(extractSalaryRange(text)).toMatchObject({ min, max, currency });
  });

  it("'hasta' produce solo tope", () => {
    expect(extractSalaryRange("Sueldo hasta Q15,000")).toMatchObject({ min: null, max: 15000 });
  });

  it("anual en GTQ se divide entre 14 (aguinaldo + bono 14); en USD entre 12", () => {
    expect(extractSalaryRange("Salario anual de Q210,000")?.maxGTQMonthly).toBe(15000);
    expect(extractSalaryRange("Compensation: US$36,000 per year")?.maxGTQMonthly).toBe(Math.round(3000 * GTQ_PER_USD));
  });

  it("regresión: 'bono anual' no vuelve anual un rango mensual", () => {
    expect(extractSalaryRange("Rango: 13-16k + bono anual.")).toMatchObject({ period: "month", maxGTQMonthly: 16000 });
    expect(extractSalaryRange("Salary: $2,000-$2,500 plus annual bonus")).toMatchObject({ period: "month" });
  });

  it("sin salario publicado → null", () => {
    expect(extractSalaryRange("Buscamos analista con 3 años de experiencia en SQL.")).toBeNull();
  });

  it("detecta si piden pretensión salarial", () => {
    expect(offerAsksExpectation("Envía tu CV indicando pretensión salarial")).toBe(true);
    expect(offerAsksExpectation("Please include your salary expectations")).toBe(true);
    expect(offerAsksExpectation("Envía tu CV")).toBe(false);
  });
});

describe("cuándo mencionar la expectativa (tabla de reglas)", () => {
  const range = extractSalaryRange("Salario: Q16,000 - Q20,000")!;
  const base = { hasOffer: true, offerRange: null, asksExpectation: false, desiredGTQ: 18000, band: "razonable" as const };
  it.each([
    [{ ...base, asksExpectation: true }, "offer-asks"],
    [{ ...base, offerRange: range }, "range-covers"],
    [{ ...base, offerRange: range, desiredGTQ: 14000 }, "range-below"],
    [{ ...base, offerRange: range, desiredGTQ: 25000 }, "range-above"],
    [{ ...base, band: "recorte" as const }, "cut"],
    [{ ...base, band: "agresivo" as const }, "aggressive-no-range"],
    [base, "default"],
  ])("regla %#", (input, id) => {
    expect(whenToMention(input).id).toBe(id);
  });
  it("la última regla siempre aplica", () => {
    expect(TIMING_RULES[TIMING_RULES.length - 1].id).toBe("default");
  });
});

describe("idioma y seniority", () => {
  it("detecta es/en", () => {
    expect(detectLanguage("Buscamos una persona con experiencia en ventas para la zona 10")).toBe("es");
    expect(detectLanguage("We are looking for a data engineer with experience in Python and SQL")).toBe("en");
    expect(detectLanguage("")).toBe("es");
  });
  it("palabras clave mandan sobre años", () => {
    expect(detectSeniority(3, "Líder de equipo de datos")).toBe("lead");
    expect(detectSeniority(8, "Desarrollador Jr.")).toBe("junior");
    expect(detectSeniority(4, "Analista Semi Senior")).toBe("semi-senior");
    expect(detectSeniority(6, "Analista de datos")).toBe("senior");
    expect(detectSeniority(1, "Analista de datos")).toBe("junior");
    expect(detectSeniority(12, "Analista")).toBe("lead");
  });
});

describe("requisitos por viñetas", () => {
  it("toma las viñetas tal cual", () => {
    const offer = "Requisitos:\n- 3 años con SQL\n• Power BI avanzado\n* Inglés intermedio\nOfrecemos: buen ambiente";
    expect(extractRequirementsHeuristic(offer)).toEqual(["3 años con SQL", "Power BI avanzado", "Inglés intermedio"]);
  });
});

describe("chequeo de consistencia numérica", () => {
  const ref = { amounts: [15000, 18000, 3000], percents: [20] };
  it("acepta números calculados (con tolerancia de redondeo)", () => {
    const r = checkNumberConsistency("Pasar de Q15,000 a Q18 mil es un salto de 20 % (unos Q3,000 más).", ref);
    expect(r).toMatchObject({ ok: true, checked: 4 });
  });
  it("marca porcentajes y montos inventados", () => {
    const r = checkNumberConsistency("Es un aumento del 35% y podrías pedir Q21,000. Tienes 5 años de experiencia.", ref);
    expect(r.ok).toBe(false);
    expect(r.flagged.map((f) => [f.kind, f.value])).toEqual([
      ["percent", 35],
      ["amount", 21000],
    ]);
  });
});

import { checkOnTopic } from "@/lib/heuristics/topic";
import { computeMode } from "@/lib/ollama-client";

describe("chequeo en tema", () => {
  it("nota de negociación → en tema", () => {
    expect(checkOnTopic("Tu expectativa salarial es razonable; menciónala en la entrevista con RR. HH.").onTopic).toBe(true);
  });
  it("carta 'de interés' leída como finanzas → fuera de tema (caso real de qwen3.5:2b)", () => {
    const r = checkOnTopic("Una carta de interés explica el interés compuesto de tu salario y el IVA que pagas.");
    expect(r.onTopic).toBe(false);
    expect(r.offTopicHits).toEqual(["interés compuesto", "IVA"]);
  });
});

describe("modo CPU/GPU desde /api/ps", () => {
  it("size_vram decide", () => {
    expect(computeMode({ size: 4e9, size_vram: 0 })).toBe("cpu");
    expect(computeMode({ size: 4e9, size_vram: 4e9 })).toBe("gpu");
    expect(computeMode({ size: 4e9, size_vram: 1e9 })).toBe("partial");
  });
});
