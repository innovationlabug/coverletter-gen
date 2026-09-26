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

/** Palabras de ingeniería que no deben aparecer en la interfaz. */
const TECH_WORDS = ["Ollama", "Gemini", "Vertex", "GPU", "tier", "T0", "T1", "T2", "Protocolo", "espécimen", "EXP. 07", "tok/s", "gemma", "qwen"];

async function expectNoTechWords(page: Page) {
  const text = await page.locator("body").innerText();
  for (const w of TECH_WORDS) expect(text, `la UI no debería decir "${w}"`).not.toContain(w);
}

test("flujo completo: formulario corto, espera de una línea, carta y nota privada", async ({ page }) => {
  const letterBodies = await mockApis(page, { negotiationDelayMs: 4500 });
  await page.goto("/");
  await expectNoTechWords(page);
  await expect(page.getByRole("radio")).toHaveCount(0); // sin selector de modelo
  // correo y teléfono no se usan en la carta: no se piden
  await expect(page.locator("input[name=email], input[name=phone]")).toHaveCount(0);
  // a la vista solo lo esencial; el resto va plegado en "Más detalles"
  for (const name of ["desiredRole", "targetCompany", "currentSalary", "desiredSalary", "yearsExperience"]) {
    await expect(page.locator(`[name=${name}]`)).toBeVisible();
  }
  for (const name of ["fullName", "currentRole", "currentEmployer", "achievements", "jobOffer"]) {
    await expect(page.locator(`[name=${name}]`)).toBeHidden();
  }

  await page.getByTestId("load-example").click();
  await expect(page.locator("input[name=desiredRole]")).toHaveValue("Analista de BI Senior");
  await page.getByText("Más detalles (opcional)").click();
  await expect(page.locator("textarea[name=jobOffer]")).toHaveValue(/Q16,000 - Q19,000/);
  await page.getByTestId("run").click();

  // mientras el modelo privado "despierta": una línea y una barra, nada más
  await expect(page.getByTestId("waiting")).toContainText("Preparando tu carta y tu nota");
  await expect(page.locator("form")).toHaveCount(0); // el formulario se pliega
  await expect(page.getByTestId("recap")).toContainText("Analista de BI Senior · Cervecería Centro Americana");
  await expect(page.getByTestId("letter")).toHaveCount(0);
  await expect(page.getByTestId("note")).toHaveCount(0);
  await expect(page.getByTestId("waking")).toContainText("hasta un minuto la primera vez", { timeout: 6000 });
  await expectNoTechWords(page);

  await expect(page.getByTestId("waiting")).toBeHidden({ timeout: 15000 });
  await expect(page.getByTestId("letter-text")).toContainText("Analista de BI Senior");
  await expect(page.getByTestId("letter")).toHaveAttribute("data-source", "gemini");
  await expect(page.getByTestId("letter-basic")).toHaveCount(0);

  // la carta va primero; la nota privada después
  const letterBox = await page.getByTestId("letter").boundingBox();
  const noteBox = await page.getByTestId("note").boundingBox();
  expect(letterBox!.y).toBeLessThan(noteBox!.y);

  // nota: veredicto, tres cifras, a lo más dos consejos; la prosa del modelo va plegada
  await expect(page.getByTestId("note-headline")).toContainText("+16.7 %");
  await expect(page.locator(".figures dd")).toHaveText(["Q15,000", "Q17,500", "+Q2,500"]);
  expect(await page.locator(".tips li").count()).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("timing")).toContainText("primera llamada");
  await expect(page.getByTestId("draft")).toBeHidden();
  await page.getByTestId("note-more").getByText("Ver más").click();
  await expect(page.getByTestId("draft")).toBeVisible();
  await expect(page.getByTestId("draft")).toContainText("automatización de reportes");
  // el "30 %" que inventó el modelo se avisa en lenguaje llano y se marca; los números calculados no
  await expect(page.getByTestId("flagged")).toContainText("“30 %”");
  await expect(page.locator("[data-testid=draft] mark")).toHaveText(["30 %"]);
  await expectNoTechWords(page);

  // "Editar datos" vuelve a abrir el formulario con lo escrito
  await page.getByTestId("edit").click();
  await expect(page.locator("input[name=desiredRole]")).toBeFocused();
  await expect(page.locator("input[name=desiredRole]")).toHaveValue("Analista de BI Senior");

  // lo que realmente viajó a /api/letter
  expect(letterBodies).toHaveLength(1);
  for (const s of ["15000", "15,000", "17500", "17,500", "Banco Industrial", "currentSalary"]) {
    expect(letterBodies[0]).not.toContain(s);
  }
});

test("solo con los cinco datos esenciales también sale todo (firma con marcador)", async ({ page }) => {
  const letterBodies = await mockApis(page);
  await page.goto("/");
  await page.fill("input[name=desiredRole]", "Analista de BI Senior");
  await page.fill("input[name=targetCompany]", "Cervecería Centro Americana");
  await page.fill("input[name=currentSalary]", "15,000");
  await page.fill("input[name=desiredSalary]", "17,500");
  await page.fill("input[name=yearsExperience]", "5");
  await page.getByTestId("run").click();
  await expect(page.getByTestId("letter-text")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("note-headline")).toContainText("+16.7 %");
  expect(JSON.parse(letterBodies[0]).fullName).toBe("[Tu nombre]");
});

test("sin avisos de cifras cuando el borrador cuadra con los números", async ({ page }) => {
  await page.route("**/api/ollama/negotiation", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson([{ type: "done", content: "Pasar de Q15,000 a Q17,500 es razonable. Apóyate en tus reportes automatizados.", stats: null }]),
    }),
  );
  await page.route("**/api/ollama/requirements", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body: REQUIREMENTS }));
  await page.route("**/api/letter", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ letter: LETTER, model: "m", latencyMs: 1 }) }));
  await page.goto("/");
  await page.getByTestId("load-example").click();
  await page.getByTestId("run").click();
  await page.getByText("Ver más").click();
  await expect(page.getByTestId("draft")).toContainText("reportes automatizados");
  await expect(page.getByTestId("flagged")).toHaveCount(0);
  await expect(page.locator("[data-testid=draft] mark")).toHaveCount(0);
});

test("si el modelo privado no está configurado, la nota queda con los números y la carta igual sale", async ({ page }) => {
  await page.route("**/api/ollama/*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"ollama_not_configured"}' }));
  await page.route("**/api/letter", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ letter: LETTER, model: "gemini-3.8-flash", latencyMs: 1500 }) }));
  await page.goto("/");
  await page.getByTestId("load-example").click();
  await page.getByTestId("run").click();
  await page.getByText("Ver más").click();
  await expect(page.getByTestId("draft-fallback")).toContainText("siguen siendo válidos");
  await expect(page.getByTestId("note-headline")).toContainText("+16.7 %");
  await expect(page.getByTestId("letter")).toHaveAttribute("data-source", "gemini");
  await expectNoTechWords(page);
});

test("\"Usar un ejemplo\" funciona aunque se toque antes de que cargue la app (/?ejemplo)", async ({ page }) => {
  await page.goto("/?ejemplo");
  await expect(page.locator("input[name=desiredRole]")).toHaveValue("Analista de BI Senior");
  await expect(page.locator("input[name=currentSalary]")).toHaveValue("15,000");
  await expect(page).toHaveURL(/\/$/);
});

test("formulario incompleto: avisa en el campo y no llama a ningún modelo", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(ollama|letter)/.test(r.url())) apiCalls.push(r.url());
  });
  await page.goto("/");
  await page.getByTestId("run").click();
  await expect(page.locator("input[name=desiredRole]")).toBeFocused();
  // solo los cinco datos visibles son obligatorios
  await expect(page.getByText("Falta este dato")).toHaveCount(5);
  await page.fill("input[name=desiredRole]", "Analista");
  await page.getByTestId("run").click();
  await expect(page.locator("input[name=targetCompany]")).toBeFocused();
  await expect(page.getByText("Falta este dato")).toHaveCount(4);
  await expect(page.locator("form")).toBeVisible();
  expect(apiCalls).toEqual([]);
});

test("móvil 375 px: sin scroll horizontal, antes y después de generar", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockApis(page);
  await page.goto("/");
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByTestId("load-example").click();
  await page.getByTestId("run").click();
  await expect(page.getByTestId("letter-text")).toBeVisible({ timeout: 15000 });
  await page.getByText("Ver más").click();
  await expect(page.getByTestId("draft")).toContainText("automatización");
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByTestId("edit").click();
  await page.getByText("Más detalles (opcional)").click();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test("offline: tras recargar sin red la app carga (service worker) y da nota con números + carta básica", async ({ page, context }) => {
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
  await expect(page.getByTestId("offline-banner")).toContainText("Sin conexión");

  await page.getByTestId("load-example").click();
  await page.getByTestId("run").click();
  await expect(page.getByTestId("note-headline")).toContainText("+16.7 %");
  await page.getByText("Ver más").click();
  await expect(page.getByTestId("draft-fallback")).toContainText("Sin conexión");
  await expect(page.getByTestId("letter")).toHaveAttribute("data-source", "template");
  await expect(page.getByTestId("letter-basic")).toBeVisible();
  await expect(page.getByTestId("letter-text")).toContainText("Estimado equipo de Cervecería Centro Americana");
  await expect(page.getByTestId("letter-text")).not.toContainText("Banco Industrial");
  await expectNoTechWords(page);
  expect(apiCalls).toEqual([]);
  await context.setOffline(false);
});
