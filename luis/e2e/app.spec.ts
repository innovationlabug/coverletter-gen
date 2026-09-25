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
  await page.getByLabel("Tu nombre").fill("Ana Lucía Pérez");
  await page.getByLabel("Años de experiencia").fill("5");
  await page.getByLabel("Puesto actual").fill("Desarrolladora backend");
  await page.getByLabel("Empleador actual").fill("Banco Industrial");
  await page.locator("#currentSalary").fill("15000");
  await page.getByLabel("Puesto deseado").fill("Software Engineer");
  await page.getByLabel("Empresa destino").fill("Tigo Guatemala");
  await page.getByLabel("Ubicación").fill("Guatemala");
  await page.locator("#desiredSalary").fill("19000");
  await page
    .getByLabel("Logros y fortalezas")
    .fill("Migré 12 servicios a Kubernetes. En Banco Industrial gano Q15,000. Lideré un equipo de 4 personas.");
}

test("online: form → Gemini letter + private note, nothing sensitive sent", async ({ page, context }) => {
  const bodies = await mockApis(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carta y copia" })).toBeVisible();
  await fillForm(page);
  await page.getByRole("button", { name: "Generar carta y nota" }).click();

  const letter = page.getByTestId("letter");
  await expect(letter).toBeVisible();
  await expect(letter).toHaveAttribute("data-source", "gemini");
  await expect(letter).toContainText("Ana Lucía Pérez"); // signature added locally
  await expect(letter.getByRole("link", { name: /red 5G/ })).toHaveAttribute("href", "https://example.com/tigo-5g");

  const note = page.getByTestId("note");
  await expect(note).toContainText("Solo para ti, no sale de tu dispositivo");
  await expect(note).toContainText("Realista");
  await expect(note).toContainText("Glassdoor");

  await expect(page.locator('[data-api="gemini"]')).toHaveAttribute("data-status", /ok|slow/);
  await expect(page.getByTestId("manifest")).toContainText("POST /api/letter");

  expect(bodies).toHaveLength(3);
  for (const b of bodies) {
    expect(b).not.toMatch(/15,?000|19,?000|Banco Industrial|Ana Luc/i);
  }
});

test("offline: app shell loads from the service worker and still produces note + template letter", async ({
  page,
  context,
}) => {
  await mockApis(context);
  await page.goto("/");
  // Wait until the service worker controls the page and the shell is cached.
  await waitForOfflineShell(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Carta y copia" })).toBeVisible();
  await expect(page.getByTestId("net")).toContainText("Sin conexión");

  await fillForm(page);
  await page.getByRole("button", { name: "Generar carta y nota" }).click();

  const letter = page.getByTestId("letter");
  await expect(letter).toHaveAttribute("data-source", "template");
  await expect(letter).toContainText("Estimado equipo de selección de Tigo Guatemala:");
  await expect(letter).not.toContainText("Q15,000");
  await expect(letter).not.toContainText("Banco Industrial");
  await expect(page.getByTestId("note")).toContainText("Realista");
  await expect(page.locator('[data-api="gemini"]')).toHaveAttribute("data-status", "offline");
  await expect(page.getByTestId("manifest")).toContainText("Nada. Esta vez todo se resolvió en tu dispositivo.");
});

test("offline with a cached JSearch benchmark uses it (status 'desde caché')", async ({ page, context }) => {
  await mockApis(context);
  await page.goto("/");
  await fillForm(page);
  await page.getByRole("button", { name: "Generar carta y nota" }).click();
  await expect(page.getByTestId("note")).toContainText("Glassdoor");
  await waitForOfflineShell(page);

  await context.setOffline(true);
  await page.reload();
  await fillForm(page);
  await page.getByRole("button", { name: "Generar carta y nota" }).click();
  await expect(page.locator('[data-api="jsearch"]')).toHaveAttribute("data-status", "cached");
  await expect(page.getByTestId("note")).toContainText("desde caché local");
});

test("JSearch 403 (not subscribed) → chip 'falló' and note without market benchmark", async ({ page, context }) => {
  await mockApis(context);
  await context.route("**/api/salary", (route) =>
    route.fulfill({
      status: 424,
      json: { error: { code: "not_subscribed", message: "La API key no está suscrita a esta API" } },
    }),
  );
  await page.goto("/");
  await fillForm(page);
  await page.getByRole("button", { name: "Generar carta y nota" }).click();
  const chip = page.locator('[data-api="jsearch"]');
  await expect(chip).toHaveAttribute("data-status", "failed");
  await expect(chip).toContainText("no está suscrita");
  await expect(page.getByTestId("letter")).toHaveAttribute("data-source", "gemini");
  await expect(page.getByTestId("note")).toContainText("Sin referencia de mercado");
});
