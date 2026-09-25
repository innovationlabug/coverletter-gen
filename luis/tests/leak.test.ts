/**
 * Leak test (condition 2): run the full orchestrator with fetch mocked and the
 * REAL route handlers in the loop. Every outgoing request — browser → our
 * routes, and routes → Tavily / JSearch / Gemini — is captured and scanned for
 * the current salary in all its written forms and for the current employer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generate } from "@/lib/generate";
import { foldChars, salaryWrittenForms } from "@/lib/redact";
import { memoryStorage } from "@/lib/storage";
import type { Profile } from "@/lib/types";
import { installFullStackFetch, type CapturedRequest } from "./helpers";
import { profile } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function assertNoLeak(captured: CapturedRequest[], p: Profile) {
  expect(captured.length).toBeGreaterThan(0);
  const forms = [
    ...salaryWrittenForms(p.currentSalary),
    ...salaryWrittenForms(p.desiredSalary),
    // spelled-out Spanish for the fixture amounts
    ...(p.currentSalary === 15000 ? ["quince mil"] : []),
  ];
  const employer = foldChars(p.currentEmployer).trim();
  for (const req of captured) {
    const raw = `${decodeURIComponent(req.url)}\n${req.body}`;
    // JSON escapes: look at the decoded text as well
    let decoded = raw;
    try {
      decoded = `${raw}\n${JSON.stringify(JSON.parse(req.body || "null"), null, 0)}`;
    } catch {
      /* non-JSON body */
    }
    for (const form of forms) {
      const re = new RegExp(`(?<![\\d])${form.replace(/[.*+?^${}()|[\]\\$]/g, "\\$&")}(?![\\d])`, "i");
      expect(re.test(decoded), `salary form "${form}" leaked to ${req.hop} ${req.url}`).toBe(false);
    }
    expect(foldChars(decoded).includes(employer), `employer leaked to ${req.hop} ${req.url}`).toBe(false);
    // The name never leaves either.
    if (p.name) expect(foldChars(decoded).includes(foldChars(p.name)), `name leaked to ${req.url}`).toBe(false);
  }
}

const PROFILES: Record<string, Profile> = {
  "GTQ, clean achievements": profile(),
  "USD salaries": profile({ currentSalary: 2000, currentCurrency: "USD", desiredSalary: 2600, desiredCurrency: "USD" }),
  "salary pasted in logros (many forms)": profile({
    achievements:
      "Gano Q15,000 al mes (Q 15 000, 15.000, 15000, 15,000.00, 15k, 15 mil, quince mil). Quiero 19,000. Lideré 4 personas.",
  }),
  "employer with accents in logros and offer": profile({
    currentEmployer: "Cervecería Centro Americana, S.A.",
    achievements: "En CERVECERIA CENTRO AMERICANA automaticé reportes. En cervecería centro americana gané un premio.",
    jobOffer: "Buscamos alguien que venga de Cervecería Centro Americana o similar. Salario 15k.",
  }),
  "identifiers + salary in job offer": profile({
    achievements: "DPI 2345 67890 0101, NIT 1234567-8, tel +502 5555-1234, correo ana@example.com",
    jobOffer: "Rango Q15,000 - Q19,000",
  }),
};

describe("no salary / employer / name ever leaves the browser", () => {
  for (const [label, p] of Object.entries(PROFILES)) {
    it(label, async () => {
      const { captured } = installFullStackFetch();
      const result = await generate(p, { storage: memoryStorage(), isOnline: () => true, backoffMs: 1 });
      // Sanity: all three destinations were actually called on both hops.
      const upstream = captured.filter((c) => c.hop === "route→upstream").map((c) => new URL(c.url).host);
      expect(upstream).toEqual(
        expect.arrayContaining(["api.tavily.com", "api.openwebninja.com", "generativelanguage.googleapis.com"]),
      );
      expect(result.letter.source).toBe("gemini");
      assertNoLeak(captured, p);
    });
  }

  it("salary pasted in logros is redacted before reaching Gemini", async () => {
    const p = PROFILES["salary pasted in logros (many forms)"];
    const { captured } = installFullStackFetch();
    await generate(p, { storage: memoryStorage(), isOnline: () => true, backoffMs: 1 });
    const letterBody = JSON.parse(captured.find((c) => c.url === "/api/letter")!.body);
    expect(letterBody.achievements).toContain("[monto]");
    expect(letterBody.achievements).toContain("Lideré 4 personas.");
    expect(letterBody.achievements).not.toMatch(/\d{2}[,. ]?\d{3}|\d+k|quince/);
  });

  it("target company == current employer → blocked, nothing sent to Tavily or Gemini", async () => {
    const p = profile({ targetCompany: "BANCO INDUSTRIAL" });
    const { captured } = installFullStackFetch();
    const result = await generate(p, { storage: memoryStorage(), isOnline: () => true, backoffMs: 1 });
    expect(result.statuses.tavily.status).toBe("blocked");
    expect(result.statuses.gemini.status).toBe("blocked");
    expect(result.letter.source).toBe("template");
    expect(captured.some((c) => c.url.includes("tavily") || c.url === "/api/company")).toBe(false);
    assertNoLeak(captured, p);
  });

  it("the server rejects money even if a client bypassed the router", async () => {
    installFullStackFetch();
    const res = await fetch("/api/company", {
      method: "POST",
      body: JSON.stringify({ company: "Tigo", role: "Dev con Q15,000" }),
    });
    expect(res.status).toBe(422);
  });

  it("the server rejects unknown fields (strict schema)", async () => {
    installFullStackFetch();
    const res = await fetch("/api/salary", {
      method: "POST",
      body: JSON.stringify({ jobTitle: "Dev", location: "Guatemala", yearsBucket: "ONE_TO_THREE", currentSalary: 1 }),
    });
    expect(res.status).toBe(400);
  });
});
