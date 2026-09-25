import { test, expect, type Page, type Route } from "@playwright/test";

const ndjson = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

const NEGOTIATION = ndjson([
  { type: "status", phase: "connecting", model: "gemma4:e2b-it-qat" },
  { type: "status", phase: "generating" },
  { type: "delta", text: "Tu expectativa es razonable. " },
  {
    type: "done",
    content:
      "Tu expectativa es razonable: pasar de Q15,000 a Q17,500 es un salto de 16.7 % y cae dentro del rango publicado. Apóyate en la automatización de reportes. Algunos piden 30 % más, pero no es tu caso.",
    stats: { model: "gemma4:e2b-it-qat", ttftMs: 820, totalMs: 6400, evalCount: 118, promptEvalCount: 402, tokensPerSecond: 19.6, loadMs: 3, ollamaTotalMs: 6100 },
    memory: { mode: "cpu", size: 4051162888, sizeVram: 0 },
  },
]);

const REQUIREMENTS_JSON = JSON.stringify({ must: ["4 años en inteligencia de negocios", "SQL avanzado y Power BI"], nice: ["Inglés intermedio"], keywords: ["SQL", "Power BI"] });
const REQUIREMENTS = ndjson([
  { type: "status", phase: "generating" },
  { type: "done", content: REQUIREMENTS_JSON, stats: { model: "gemma4:e2b-it-qat", ttftMs: 900, totalMs: 4000, evalCount: 66, promptEvalCount: 247, tokensPerSecond: 19.4, loadMs: 2, ollamaTotalMs: 3900 }, memory: null },
]);

const LETTER = "Estimado equipo de Cervecería Centro Americana:\n\nLes escribo para postularme como Analista de BI Senior…\n\nAtentamente,\nMaría José Castillo";

async function mockApis(page: Page, opts: { negotiationDelayMs?: number } = {}) {
  const letterBodies: string[] = [];
  await page.route("**/api/ollama/negotiation", async (route: Route) => {
    if (opts.negotiationDelayMs) await new Promise((r) => setTimeout(r, opts.negotiationDelayMs));
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: NEGOTIATION });
  });
  await page.route("**/api/ollama/requirements", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body: REQUIREMENTS }));
  await page.route("**/api/letter", async (route) => {
    letterBodies.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ letter: LETTER, model: "gemini-3.8-flash", latencyMs: 2100 }) });
  });
  return letterBodies;
}

test("flujo completo: nota privada + carta + panel de tiers (con GPU despertando)", async ({ page }) => {
  const letterBodies = await mockApis(page, { negotiationDelayMs: 4500 });
  await page.goto("/");
  await page.getByTestId("load-example").click();
  await page.getByTestId("run").click();

  await expect(page.getByTestId("waking")).toBeVisible({ timeout: 6000 });
  await expect(page.getByTestId("waking")).toContainText("Despertando la GPU");

  const note = page.getByTestId("note");
  await expect(note).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("note-headline")).toContainText("+16.7 %");
  await expect(page.getByTestId("draft")).toContainText("automatización de reportes");
  // el "30 %" que inventó el modelo queda marcado; los números calculados no
  await expect(page.getByTestId("flagged")).toContainText("1 cifra");
  await expect(page.locator("[data-testid=draft] mark")).toHaveText(["30 %"]);
  await expect(page.getByTestId("timing")).toContainText("range-covers");

  await expect(page.getByTestId("letter-text")).toContainText("Analista de BI Senior");
  await expect(page.getByTestId("letter-source")).toContainText("gemini-3.8-flash");
  await expect(page.getByTestId("instrument")).toContainText("19.6");
  await expect(page.getByTestId("instrument")).toContainText("CPU");

  await expect(page.getByTestId("tier-1")).toContainText("currentSalary");
  const t2 = page.getByTestId("t2-payload");
  await expect(t2).toContainText("[EMPLEADOR_ACTUAL]");

  // lo que realmente viajó a /api/letter
  expect(letterBodies).toHaveLength(1);
  for (const s of ["15000", "15,000", "17500", "17,500", "Banco Industrial", "majo.castillo", "5512", "currentSalary"]) {
    expect(letterBodies[0]).not.toContain(s);
  }
});

test("si Ollama no está configurado, la nota cae a heurísticas y la carta igual sale", async ({ page }) => {
  await page.route("**/api/ollama/*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"ollama_not_configured"}' }));
  await page.route("**/api/letter", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ letter: LETTER, model: "gemini-3.8-flash", latencyMs: 1500 }) }));
  await page.goto("/");
  await page.getByTestId("load-example").click();
  await page.getByTestId("run").click();
  await expect(page.getByTestId("draft-fallback")).toContainText("heurísticas");
  await expect(page.getByTestId("note-headline")).toContainText("+16.7 %");
  await expect(page.getByTestId("letter-source")).toContainText("gemini");
});

test("offline: tras recargar sin red la app carga (service worker) y da nota heurística + carta de plantilla", async ({ page, context }) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(ollama|letter)/.test(r.url())) apiCalls.push(r.url());
  });
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  // que el precache termine antes de cortar la red
  await page.waitForFunction(async () => (await (await caches.open("cathy-v1")).keys()).length > 5, null, { timeout: 15000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await expect(page.getByTestId("net-chip")).toContainText("Sin conexión");

  await page.getByTestId("load-example").click();
  await page.getByTestId("run").click();
  await expect(page.getByTestId("note-headline")).toContainText("+16.7 %");
  await expect(page.getByTestId("draft-fallback")).toContainText("Sin conexión");
  await expect(page.getByTestId("letter-source")).toContainText("plantilla determinista");
  await expect(page.getByTestId("letter-text")).toContainText("Estimado equipo de Cervecería Centro Americana");
  await expect(page.getByTestId("letter-text")).not.toContainText("Banco Industrial");
  expect(apiCalls).toEqual([]);
  await context.setOffline(false);
});
