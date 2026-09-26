import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const FACTS = {
  facts: [
    { id: 1, title: "Tigo Guatemala amplía su red 5G", url: "https://example.com/tigo-5g", snippet: "Expansión 5G." },
  ],
  upstream: { url: "https://api.tavily.com/search", body: { query: "Tigo Guatemala", max_results: 3, search_depth: "basic" } },
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
  upstream: { url: "https://api.openwebninja.com/jsearch/estimated-salary", params: {} },
};
const LETTER = {
  letter:
    "Estimado equipo de selección de Tigo Guatemala:\n\nMe interesa el puesto de Software Engineer y su expansión 5G.\n\nAtentamente,\n[[FIRMA]]",
  usedFacts: [1],
  model: "gemini-3.8-flash",
  upstream: { model: "gemini-3.8-flash", prompt: "Puesto al que aplica: Software Engineer" },
};

/** Mock the three API routes and record every body the browser sends. */
async function mockApis(context: BrowserContext) {
  const bodies: string[] = [];
  const handle = (json: unknown) => async (route: import("@playwright/test").Route) => {
    bodies.push(route.request().postData() ?? "");
    await route.fulfill({ json });
  };
  await context.route("**/api/company", handle(FACTS));
  await context.route("**/api/salary", handle(SALARY));
  await context.route("**/api/letter", handle(LETTER));
  return bodies;
}

/**
 * NOTE: page.waitForFunction() does not await an async predicate (a Promise is
 * truthy, so it resolves at once). Poll page.evaluate() instead.
 */
async function waitForOfflineShell(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg?.active?.state !== "activated" || !navigator.serviceWorker.controller) return "sw-not-ready";
          if (!(await caches.match("/"))) return "no-shell";
          const assets = await caches.open("carta-assets-v1");
          const n = (await assets.keys()).length;
          return n > 5 ? "ready" : `assets:${n}`;
        }),
      { timeout: 30_000, intervals: [250, 500, 1000] },
    )
    .toBe("ready");
}

async function fillForm(page: Page) {
  await page.getByLabel("Puesto al que aplicas").fill("Software Engineer");
  await page.getByLabel("Empresa", { exact: true }).fill("Tigo Guatemala");
  await page.locator("#currentSalary").fill("15000");
  await page.locator("#desiredSalary").fill("19000");
  await page.getByLabel("Años de experiencia").fill("5");
  // Everything else lives behind one collapsed disclosure; location defaults to Guatemala.
  await expect(page.getByLabel("Tu nombre")).toBeHidden();
  await page.getByText("Más detalles (opcional)").click();
  await expect(page.getByLabel("Ubicación")).toHaveValue("Guatemala");
  await page.getByLabel("Tu nombre").fill("Ana Lucía Pérez");
  await page.getByLabel("Puesto actual").fill("Desarrolladora backend");
  await page.getByLabel("Empleador actual").fill("Banco Industrial");
  await page
    .getByLabel("Logros")
    .fill("Migré 12 servicios a Kubernetes. En Banco Industrial gano Q15,000. Lideré un equipo de 4 personas.");
}

/** Open the note's single "Ver más" disclosure. */
async function openNoteMore(page: Page) {
  await page.getByTestId("note").getByText("Ver más").click();
}

const SUBMIT = "Crear carta y nota";
const LEAK = /15,?000|19,?000|Banco Industrial|Ana Luc/i;

/** The UI is for a job seeker: no provider names, HTTP codes or payload dumps. */
async function expectNoInternals(page: Page) {
  const body = page.locator("body");
  for (const word of ["Qué salió a la nube", "Tavily", "JSearch", "Gemini", "HTTP", "403", "POST /api"]) {
    await expect(body).not.toContainText(word);
  }
}

test("validation: empty form points to the first missing field", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: SUBMIT }).click();
  await expect(page.getByText("Escribe el puesto al que aplicas.")).toBeVisible();
  await expect(page.getByLabel("Puesto al que aplicas")).toBeFocused();
  await expect(page.getByTestId("letter")).toHaveCount(0);
});

test("online: form → letter with sources + private note, nothing sensitive sent", async ({ page, context }) => {
  const bodies = await mockApis(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carta y copia" })).toBeVisible();
  await fillForm(page);
  await page.getByRole("button", { name: SUBMIT }).click();

  const letter = page.getByTestId("letter");
  await expect(letter).toBeVisible();
  await expect(letter).toHaveAttribute("data-source", "gemini");
  await expect(letter).toContainText("Ana Lucía Pérez"); // signature added locally
  await expect(letter.getByRole("link", { name: /red 5G/ })).toHaveAttribute("href", "https://example.com/tigo-5g");
  await expect(letter.getByRole("button", { name: "Copiar" })).toBeVisible();
  await expect(page.getByTestId("notice")).toHaveCount(0);

  const note = page.getByTestId("note");
  await expect(note).toContainText("Solo para ti");
  await expect(note.locator(".verdict")).toHaveText("Realista · pides 27 % más");
  await expect(note).toContainText("Glassdoor");
  await expect(note).toContainText("Si te piden un número");
  // The suggested range is shown once, and at most two tips are visible.
  const range = (await note.locator(".ask-range").innerText()).split(" ")[0];
  const visible = await note.innerText();
  expect(visible.split(range.split("–")[1]).length - 1).toBe(1);
  await expect(note.locator(".tips li")).toHaveCount(2);
  await expect(note.getByText("Lo que nunca va por escrito")).toBeHidden();
  await openNoteMore(page);
  await expect(note.getByText("Lo que nunca va por escrito")).toBeVisible();

  await expectNoInternals(page);

  // Network-level leak check: every body the browser sent, captured by interception.
  expect(bodies).toHaveLength(3);
  for (const b of bodies) expect(b).not.toMatch(LEAK);

  // The letter can be edited in place.
  await letter.getByRole("button", { name: "Editar" }).click();
  await letter.getByLabel("Texto de la carta").fill("Hola equipo de Tigo");
  await letter.getByRole("button", { name: "Listo" }).click();
  await expect(letter).toContainText("Hola equipo de Tigo");

  // Back to the form keeps the data.
  await page.getByRole("button", { name: "Editar datos" }).click();
  await expect(page.getByLabel("Puesto al que aplicas")).toHaveValue("Software Engineer");
});

test("offline: app shell loads from the service worker and still produces note + base letter", async ({
  page,
  context,
}) => {
  const bodies = await mockApis(context);
  await page.goto("/");
  // Wait until the service worker controls the page and the shell is cached.
  await waitForOfflineShell(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Carta y copia" })).toBeVisible();
  await expect(page.getByTestId("net")).toContainText("Sin conexión");

  await fillForm(page);
  await page.getByRole("button", { name: SUBMIT }).click();

  const letter = page.getByTestId("letter");
  await expect(letter).toHaveAttribute("data-source", "template");
  await expect(letter).toContainText("Estimado equipo de selección de Tigo Guatemala:");
  await expect(letter).not.toContainText("Q15,000");
  await expect(letter).not.toContainText("Banco Industrial");
  await expect(page.getByTestId("notice")).toContainText("versión base de la carta que puedes editar");
  await expect(page.getByTestId("note")).toContainText("Realista");
  await openNoteMore(page);
  await expect(page.getByTestId("note").getByText(/Sin conexión no pudimos consultar salarios/)).toBeVisible();
  await expectNoInternals(page);
  // Nothing left the device.
  expect(bodies).toHaveLength(0);
});

test("offline with a saved market benchmark still shows the market comparison", async ({ page, context }) => {
  const bodies = await mockApis(context);
  await page.goto("/");
  await fillForm(page);
  await page.getByRole("button", { name: SUBMIT }).click();
  await expect(page.getByTestId("note")).toContainText("Glassdoor");
  await waitForOfflineShell(page);
  expect(bodies).toHaveLength(3);

  await context.setOffline(true);
  await page.reload();
  await fillForm(page);
  await page.getByRole("button", { name: SUBMIT }).click();
  const note = page.getByTestId("note");
  await expect(note).toContainText("Glassdoor");
  await expect(note.locator(".market-source")).toContainText("datos guardados");
  await expect(note.getByRole("img", { name: /Mercado: de Q11,625 a Q22,333/ })).toBeVisible();
  expect(bodies).toHaveLength(3); // no new request while offline
});

test("salary service refuses (JSearch 403) → plain-language note without market data", async ({ page, context }) => {
  const bodies = await mockApis(context);
  await context.route("**/api/salary", (route) =>
    route.fulfill({
      status: 424,
      json: { error: { code: "not_subscribed", message: "La API key no está suscrita a esta API" } },
    }),
  );
  await page.goto("/");
  await fillForm(page);
  await page.getByRole("button", { name: SUBMIT }).click();
  await expect(page.getByTestId("letter")).toHaveAttribute("data-source", "gemini");
  const note = page.getByTestId("note");
  await expect(note).toContainText("Realista");
  await expect(note.getByRole("img", { name: /Mercado/ })).toHaveCount(0);
  await openNoteMore(page);
  await expect(note.getByText(/No encontramos datos de mercado para este puesto/)).toBeVisible();
  await expect(note).not.toContainText("suscrita");
  await expectNoInternals(page);
  for (const b of bodies) expect(b).not.toMatch(LEAK);
});

test("AI letter service fails → base letter with a plain-language notice", async ({ page, context }) => {
  await mockApis(context);
  await context.route("**/api/letter", (route) =>
    route.fulfill({ status: 424, json: { error: { code: "upstream_auth", message: "bad key" } } }),
  );
  await page.goto("/");
  await fillForm(page);
  await page.getByRole("button", { name: SUBMIT }).click();
  await expect(page.getByTestId("letter")).toHaveAttribute("data-source", "template");
  await expect(page.getByTestId("notice")).toHaveText(
    "No pudimos contactar al servicio; te dejamos una versión base que puedes editar.",
  );
  await expectNoInternals(page);
});

test("375 px: no horizontal scroll on the form or the results", async ({ page, context }) => {
  await mockApis(context);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noHScroll()).toBe(true);
  await page.getByRole("button", { name: "Llenar con un ejemplo" }).click();
  await page.getByText("Más detalles (opcional)").click();
  expect(await noHScroll()).toBe(true);
  await page.getByRole("button", { name: SUBMIT }).click();
  await expect(page.getByTestId("note")).toBeVisible();
  await openNoteMore(page);
  expect(await noHScroll()).toBe(true);
});
