import { describe, expect, it } from "vitest";
import { caretAfterFormat, countDigits, formatMoneyInput, slugify } from "@/lib/money-input";
import { parseMoney } from "@/lib/heuristics/money";

describe("formatMoneyInput", () => {
  it("agrupa miles mientras se escribe", () => {
    expect(formatMoneyInput("1")).toBe("1");
    expect(formatMoneyInput("1500")).toBe("1,500");
    expect(formatMoneyInput("15000")).toBe("15,000");
    expect(formatMoneyInput("1,50000")).toBe("150,000");
    expect(formatMoneyInput("15,000")).toBe("15,000");
    expect(formatMoneyInput("1234567")).toBe("1,234,567");
  });

  it("respeta decimales y vacíos", () => {
    expect(formatMoneyInput("")).toBe("");
    expect(formatMoneyInput("17500.5")).toBe("17,500.5");
    expect(formatMoneyInput("17500.")).toBe("17,500.");
    expect(formatMoneyInput("007")).toBe("7");
  });

  it("deja en paz lo que no es un número simple", () => {
    for (const s of ["15k", "USD 2000", "15 mil", "Q15,000", "17.5k"]) expect(formatMoneyInput(s)).toBe(s);
  });

  it("lo formateado se sigue entendiendo igual", () => {
    for (const s of ["15000", "17500", "2500.50"]) {
      expect(parseMoney(formatMoneyInput(s), "GTQ")?.amount).toBe(parseMoney(s, "GTQ")?.amount);
    }
  });
});

describe("caretAfterFormat", () => {
  it("mantiene el cursor tras el mismo dígito", () => {
    // "1500|0" → "15,00|0"
    expect(caretAfterFormat("15,000", countDigits("1500"))).toBe(5);
    expect(caretAfterFormat("15,000", 0)).toBe(0);
    expect(caretAfterFormat("15,000", 5)).toBe(6);
  });
});

describe("slugify", () => {
  it("quita tildes y espacios", () => {
    expect(slugify("Cervecería Centro Americana")).toBe("cerveceria-centro-americana");
    expect(slugify("  ¡Ñandú & Co.! ")).toBe("nandu-co");
  });
});
