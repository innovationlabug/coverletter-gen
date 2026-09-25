import { test, type Page } from "@playwright/test";

/**
 * Capturas de la UI para el README / revisión de diseño. No es una prueba: solo corre con
 *   SCREENSHOTS=1 npx playwright test screenshots
 * y escribe docs/screenshots/ui-*.png. Las APIs se simulan igual que en flow.spec.ts.
 */
test.skip(!process.env.SCREENSHOTS, "solo con SCREENSHOTS=1");

const ndjson = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

const DRAFT =
  "Tu expectativa es razonable: pasar de Q15,000 a Q17,500 es un salto de 16.7 % y cae dentro del rango que publica la oferta, así que no tienes que esconder el número.\n\nTu mejor argumento es la automatización de los 40 reportes semanales: son 12 horas por semana que el equipo de riesgo recuperó. Llévalo a la primera llamada con RR. HH. y habla de ese impacto antes que del salario.\n\nSi te preguntan por tu expectativa, dila con calma y sin disculparte: está dentro de lo que ellos mismos ofrecen.";

const LETTER = `Estimado equipo de Cervecería Centro Americana:

Les escribo para expresar mi interés en la posición de Analista de BI Senior. En los últimos cinco años he trabajado convirtiendo datos dispersos en reportes que los equipos usan para decidir, y me entusiasma la idea de hacerlo para el área comercial de una empresa como la suya.

En mi puesto actual automaticé 40 reportes semanales con Power BI y SQL, lo que liberó 12 horas por semana al equipo de riesgo, y lideré la migración de un data mart de cartera a la nube. Su oferta pide SQL avanzado, Power BI y experiencia con modelos dimensionales: es justo el trabajo que hago a diario y en el que quiero seguir creciendo.

Me encantaría conversar sobre cómo puedo aportar a su equipo. Quedo atenta a su respuesta.

Saludos cordiales,
María José Castillo`;

async function mock(page: Page, delayMs = 0) {
  await page.route("**/api/ollama/negotiation", async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: ndjson([{ type: "done", content: DRAFT, stats: null }]) });
  });
  await page.route("**/api/ollama/requirements", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson([{ type: "done", content: JSON.stringify({ must: ["SQL avanzado y Power BI"], nice: [], keywords: [] }), stats: null }]),
    }),
  );
  await page.route("**/api/letter", async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ letter: LETTER, model: "m", latencyMs: 1 }) });
  });
}

const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

for (const size of SIZES) {
  test(`capturas ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const shot = (name: string, fullPage = false) => page.screenshot({ path: `docs/screenshots/ui-${name}-${size.name}.png`, fullPage });

    await mock(page, 8000);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await shot("form");

    await page.getByTestId("load-example").click();
    await page.getByTestId("run").click();
    await page.getByTestId("waking").waitFor({ timeout: 8000 });
    await page.getByTestId("waiting").scrollIntoViewIfNeeded();
    await shot("waiting");

    await page.getByTestId("letter-text").waitFor({ timeout: 20000 });
    await page.getByTestId("draft").getByText("primera llamada").first().waitFor();
    await page.getByTestId("letter").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -16));
    await shot("letter");
    await page.getByTestId("note").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -16));
    await shot("note");
    await shot("full", true);
  });
}
