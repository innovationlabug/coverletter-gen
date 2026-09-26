// Regenerates docs/screenshots/ui-*.png against a running production build
// with the three API routes mocked (no keys, no quota). Leaves produccion-*.png alone.
// Usage: npm run build && npx next start -p 3100 &  then  node scripts/screenshots.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "docs/screenshots";

const FACTS = {
  facts: [
    { id: 1, title: "Tigo Guatemala amplía su red 5G a 10 ciudades", url: "https://example.com/tigo-5g", snippet: "" },
    { id: 2, title: "Tigo Money supera el millón de usuarios", url: "https://example.com/tigo-money", snippet: "" },
  ],
};
const SALARY = {
  benchmark: {
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
  },
};
const LETTER = {
  letter: [
    "Estimado equipo de selección de Tigo Guatemala:",
    "Me interesa el puesto de Software Engineer. La expansión de su red 5G a diez ciudades y el crecimiento de Tigo Money muestran un equipo que construye servicios que millones de personas usan a diario, y quiero aportar a ese trabajo.",
    "En los últimos cinco años he trabajado como desarrolladora backend. Migré doce servicios de pagos a Kubernetes y reduje la latencia en 40 %, y lideré a un equipo de cuatro personas en ese proceso. Me siento cómoda con Java, Go, microservicios y la nube.",
    "Me encantaría conversar sobre cómo puedo contribuir a sus próximos proyectos.",
    "Atentamente,\n[[FIRMA]]",
  ].join("\n\n"),
  usedFacts: [1, 2],
  model: "x",
};

const shots = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, scale: 2 },
  { name: "mobile", viewport: { width: 390, height: 844 }, scale: 3, mobile: true },
];

const browser = await chromium.launch();
for (const s of shots) {
  for (const scheme of s.name === "desktop" ? ["light", "dark"] : ["light"]) {
    const context = await browser.newContext({
      viewport: s.viewport,
      deviceScaleFactor: s.scale,
      isMobile: !!s.mobile,
      hasTouch: !!s.mobile,
      colorScheme: scheme,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.route("**/api/company", (r) => r.fulfill({ json: FACTS }));
    await context.route("**/api/salary", (r) => r.fulfill({ json: SALARY }));
    await context.route("**/api/letter", (r) => r.fulfill({ json: LETTER }));
    const page = await context.newPage();
    await page.goto(BASE);
    await page.evaluate(() => document.fonts.ready);
    const suffix = scheme === "dark" ? "-dark" : "";
    if (scheme === "light") await page.screenshot({ path: `${OUT}/ui-${s.name}-form.png` });

    await page.getByRole("button", { name: "Llenar con un ejemplo" }).click();
    await page.getByRole("button", { name: "Crear carta y nota" }).click();
    await page.getByTestId("note").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/ui-${s.name}-results${suffix}.png`, fullPage: true });
    console.log("wrote", s.name, scheme);
    await context.close();
  }
}
await browser.close();
