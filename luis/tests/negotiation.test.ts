import { describe, expect, it } from "vitest";
import { FX_GTQ_PER_USD } from "@/config/constants";
import { bandForGap, buildNegotiationNote, findOfferRange, gapPercent, toGTQ, toMonthly } from "@/lib/negotiation";
import type { SalaryBenchmark } from "@/lib/types";
import { profile } from "./fixtures";

describe("bands", () => {
  it.each([
    [-5, "below"],
    [0, "conservative"],
    [9.9, "conservative"],
    [10, "realistic"],
    [30, "realistic"],
    [30.1, "ambitious"],
    [60, "ambitious"],
    [61, "out_of_range"],
  ])("gap %d%% → %s", (gap, id) => expect(bandForGap(gap).id).toBe(id));

  it("gap is computed after currency conversion", () => {
    const cur = toGTQ(1000, "USD")!;
    expect(cur).toBe(1000 * FX_GTQ_PER_USD);
    expect(gapPercent(cur, 9300)).toBeCloseTo(20, 0);
  });
});

describe("period normalization", () => {
  it.each([
    [120000, "YEAR", 10000],
    [10000, "MONTH", 10000],
    [50, "HOUR", (50 * 40 * 52) / 12],
    [2500, "WEEK", (2500 * 52) / 12],
  ])("%d per %s → %d monthly", (amount, period, monthly) => {
    expect(toMonthly(amount, period)).toBeCloseTo(monthly);
  });
});

describe("offer range regex", () => {
  it.each([
    ["Salario: Q16,000 - Q22,000 mensuales", 16000, 22000, "GTQ"],
    ["Ofrecemos entre Q8,000 y Q12,000", 8000, 12000, "GTQ"],
    ["Rango: $1,500 – $2,000", 1500, 2000, "USD"],
    ["Pago USD 1500-2000 al mes", 1500, 2000, "USD"],
    ["de 8 a 12 mil quetzales", 8000, 12000, "GTQ"],
    ["Rango 10k-14k", 10000, 14000, "GTQ"],
    ["Salario: 9000 a 11000", 9000, 11000, "GTQ"],
    ["Sueldo de Q9,500 más prestaciones", 9500, 9500, "GTQ"],
  ])("%j", (text, min, max, currency) => {
    const r = findOfferRange(text, "GTQ");
    expect(r).not.toBeNull();
    expect(r!.min).toBe(min);
    expect(r!.max).toBe(max);
    expect(r!.currency).toBe(currency);
  });

  it("ignores experience ranges and offers without salary", () => {
    expect(findOfferRange("Requisitos: 2-3 años de experiencia, inglés 80 %")).toBeNull();
    expect(findOfferRange("Buscamos Software Engineer para 2025")).toBeNull();
  });

  it("detects annual ranges", () => {
    expect(findOfferRange("USD 60,000 - 80,000 anuales")!.period).toBe("YEAR");
  });
});

describe("buildNegotiationNote", () => {
  const benchmark: SalaryBenchmark = {
    jobTitle: "Software Engineer",
    location: "Guatemala",
    minSalary: 11625,
    medianSalary: 17666.67,
    maxSalary: 22333.33,
    period: "MONTH",
    currency: "GTQ",
    publisher: "Glassdoor",
    publisherLink: null,
    confidence: "VERY_HIGH",
    salaryCount: 59,
    updatedAt: "2026-08-20T08:25:12.000Z",
  };

  it("realistic band, market position and 'no range' advice", () => {
    const note = buildNegotiationNote({ profile: profile(), benchmark });
    expect(note.band.id).toBe("realistic");
    expect(Math.round(note.gapPct)).toBe(27);
    expect(note.market!.position).toBe("median_max");
    const when = note.sections.find((s) => s.id === "when")!.items.join(" ");
    expect(when).toMatch(/No lo pongas en la carta/);
    expect(note.sections.find((s) => s.id === "market")!.items.join(" ")).toMatch(/Glassdoor, 59 salarios/);
  });

  it("offer range covering the expectation → anchor high", () => {
    const note = buildNegotiationNote({
      profile: profile({ jobOffer: "Salario: Q16,000 - Q22,000 mensuales" }),
      benchmark,
    });
    expect(note.offerRange).toMatchObject({ min: 16000, max: 22000 });
    expect(note.sections.find((s) => s.id === "offer")!.items.join(" ")).toMatch(/cubre tu expectativa/);
    expect(note.sections.find((s) => s.id === "when")!.items[0]).toMatch(/anclando en la parte alta/);
    expect(note.suggestedRange.min).toBeGreaterThanOrEqual(19000);
    expect(note.suggestedRange.max).toBe(22000);
  });

  it("normalizes a USD yearly benchmark to GTQ monthly", () => {
    const note = buildNegotiationNote({
      profile: profile(),
      benchmark: { ...benchmark, currency: "USD", period: "YEAR", minSalary: 12000, medianSalary: 24000, maxSalary: 36000 },
    });
    expect(note.market!.medianGTQ).toBeCloseTo(2000 * FX_GTQ_PER_USD);
  });

  it("works without benchmark and says why", () => {
    const note = buildNegotiationNote({ profile: profile(), benchmark: null, benchmarkUnavailableReason: "JSearch falló (403)." });
    expect(note.market).toBeNull();
    expect(note.sections.find((s) => s.id === "market")!.items[0]).toMatch(/JSearch falló/);
  });

  it("flags out-of-range expectations", () => {
    expect(buildNegotiationNote({ profile: profile({ desiredSalary: 30000 }) }).band.id).toBe("out_of_range");
  });
});
