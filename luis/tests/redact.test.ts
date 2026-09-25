import { describe, expect, it } from "vitest";
import {
  assertPayloadClean,
  dropSensitiveSentences,
  findSensitive,
  parseAmount,
  redactText,
  salaryWrittenForms,
  SensitiveDataError,
} from "@/lib/redact";

const kinds = (text: string, ctx = {}) => findSensitive(text, ctx).map((f) => f.kind);

describe("parseAmount", () => {
  it.each([
    ["Q15,000", 15000],
    ["Q 15 000", 15000],
    ["15.000", 15000],
    ["15,000.00", 15000],
    ["15000", 15000],
    ["15k", 15000],
    ["15 mil", 15000],
    ["$2,000", 2000],
    ["USD 2000", 2000],
    ["1.5 millones", 1500000],
    ["Q.8,500.50", 8500.5],
  ])("%s → %d", (raw, value) => {
    expect(parseAmount(raw)).toBeCloseTo(value);
  });
});

describe("money detection (no context)", () => {
  it.each([
    "Gano Q15,000 al mes",
    "Gano Q 15 000 al mes",
    "Gano Q15000",
    "Gano 15000 al mes",
    "Gano 15,000.00",
    "Gano 15.000",
    "pido $2,000",
    "pido USD 2000",
    "pido US$ 1,800",
    "unos 15 mil quetzales",
    "unos 15k",
    "unos 15K al mes",
    "quince mil al mes",
    "veinticinco mil",
    "3,500 dólares",
    "2 millones",
  ])("flags money in %j", (text) => {
    expect(kinds(text)).toContain("money");
  });

  it("does not flag years, percentages or small counts", () => {
    expect(kinds("Desde 2019 bajé la latencia 40 % con 12 servicios y 4 personas")).toEqual([]);
  });

  it("redacts with neutral tags", () => {
    expect(redactText("Gano Q15,000 y quiero Q19,000.").text).toBe("Gano [monto] y quiero [monto].");
  });
});

describe("salary-specific detection", () => {
  const ctx = { salaries: [15000] };
  it.each(salaryWrittenForms(15000))("flags current salary written as %j", (form) => {
    const found = findSensitive(`mi salario: ${form} mensual`, ctx);
    expect(found.length).toBeGreaterThan(0);
    expect(redactText(`mi salario: ${form} mensual`, ctx).text).not.toMatch(/15/);
  });

  it("flags a small salary that the generic money rules would miss", () => {
    expect(kinds("cobro 800 al mes", { salaries: [800] })).toContain("salary");
  });

  it("flags salary digits glued to other text", () => {
    expect(kinds("ref15000x", { salaries: [15000] })).toContain("salary");
  });

  it("flags a salary that looks like a year", () => {
    expect(kinds("gano 2000 dólares", { salaries: [2000] })).toContain("salary");
    expect(kinds("gano 2000", { salaries: [2000] })).toContain("salary");
  });
});

describe("identifiers", () => {
  it("emails", () => {
    expect(kinds("escríbeme a ana.perez+cv@correo.com.gt")).toEqual(["email"]);
  });
  it.each(["5555-1234", "5555 1234", "55551234", "+502 5555 1234", "+502-5555-1234", "(502) 2222-3333", "50255551234"])(
    "GT phone %j",
    (p) => {
      expect(kinds(`llámame al ${p}`)).toEqual(["phone"]);
    },
  );
  it.each(["2345 67890 0101", "2345-67890-0101", "2345678900101"])("DPI %j", (d) => {
    expect(kinds(`DPI ${d}`)).toEqual(["dpi"]);
  });
  it.each(["NIT 1234567-8", "NIT: 123456K", "mi nit es 7654321-K"])("NIT %j", (n) => {
    expect(kinds(n)).toContain("nit");
  });
  it("does not treat a phone or DPI as money", () => {
    const r = redactText("DPI 2345 67890 0101, tel 5555-1234");
    expect(r.text).toBe("DPI [DPI], tel [teléfono]");
  });
});

describe("employer", () => {
  const ctx = { currentEmployer: "Cervecería Centro Americana, S.A." };
  it.each([
    "Trabajo en Cervecería Centro Americana desde 2019",
    "trabajo en CERVECERIA CENTRO AMERICANA",
    "en cerveceria centro-americana",
    "en Cervecería  Centro   Americana, S.A.",
  ])("case/accent insensitive: %j", (t) => {
    expect(kinds(t, ctx)).toContain("employer");
  });
  it("keeps original text around the match", () => {
    expect(redactText("Hoy en Cervecería Centro Americana lideré 3 proyectos.", ctx).text).toBe(
      "Hoy en [empleador actual] lideré 3 proyectos.",
    );
  });
  it("does not match partial words", () => {
    expect(kinds("Trabajo en Tigo", { currentEmployer: "Tig" })).toEqual([]);
  });
});

describe("assertPayloadClean", () => {
  it("throws with field path", () => {
    try {
      assertPayloadClean({ role: "Dev", company: "Banco Industrial" }, { currentEmployer: "banco industrial" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SensitiveDataError);
      expect((e as SensitiveDataError).field).toBe("$.company");
    }
  });
  it("passes clean payloads", () => {
    expect(() => assertPayloadClean({ a: "Software Engineer", n: 5, list: [{ t: "Fundada en 1998" }] })).not.toThrow();
  });
});

describe("dropSensitiveSentences", () => {
  it("drops only the sentences with findings", () => {
    const t = "Lideré un equipo de 4. Hoy gano Q15,000. Me escriben a a@b.co. Bajé costos 30 %.";
    expect(dropSensitiveSentences(t)).toBe("Lideré un equipo de 4. Bajé costos 30 %.");
  });
});
