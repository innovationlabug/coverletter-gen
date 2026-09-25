import { expect, test, type Page } from '@playwright/test';

/** Canned Gemini response returned by the intercepted Firebase AI Logic endpoint. */
const CLOUD_LETTER =
  'Estimado equipo de Telus International:\n\nCarta de la nube simulada para pruebas.\n\nQuedo atenta a una entrevista.\n\nAtentamente,\n{{NOMBRE}}';

async function mockCloud(page: Page, bodies: string[]) {
  await page.route('**/firebasevertexai.googleapis.com/**', async (route) => {
    bodies.push(`${route.request().url()}\n${route.request().postData() ?? ''}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: CLOUD_LETTER }] }, finishReason: 'STOP', index: 0 }],
        usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 40, totalTokenCount: 740 },
      }),
    });
  });
}

const SALARY_FORMS = ['15000', '15,000', '15.000', 'Q15,000', 'Q 15 000', '15 mil', '15k', 'quince mil'];

test('flujo completo: plantilla, nota, nube (simulada), borrador local y panel de envío', async ({ page }) => {
  const bodies: string[] = [];
  await mockCloud(page, bodies);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('sin contar lo que ganás');

  await page.getByTestId('fill-example').click();
  await page.getByTestId('generate').click();

  // cloud letter (real Firebase SDK, intercepted endpoint), name restored locally
  await expect(page.getByTestId('cloud-status')).toContainText('Enviado');
  await expect(page.getByTestId('letter-cloud')).toContainText('María José Castillo');
  await expect(page.getByTestId('letter-cloud')).not.toContainText('{{NOMBRE}}');

  // what left the device: exactly one request, without salary / employer / name / third parties
  expect(bodies).toHaveLength(1);
  for (const form of SALARY_FORMS) expect(bodies[0].toLowerCase()).not.toContain(form);
  expect(bodies[0]).not.toMatch(/Banco Industrial/i);
  expect(bodies[0]).not.toContain('María José Castillo');
  expect(bodies[0]).not.toContain('Ana López');
  expect(bodies[0]).toContain('Telus International');

  // the panel shows the same text and the redactions
  const panel = page.getByTestId('cloud-panel');
  await expect(panel).toContainText('Datos tachados antes de salir');
  await expect(panel.locator('td s', { hasText: 'Q15,000' })).toBeVisible();
  await expect(page.getByTestId('cloud-payload')).not.toContainText('15,000');

  // private note
  await expect(page.getByTestId('note')).toContainText('Ambiciosa');
  await expect(page.getByTestId('note')).toContainText('Solo en este dispositivo');

  // template
  await page.getByTestId('tab-plantilla').click();
  await expect(page.getByTestId('letter-template')).toContainText('Estimado equipo de Telus International');

  // local draft (fake model in the e2e build)
  await page.getByTestId('model-load').click();
  await expect(page.getByTestId('letter-local')).toContainText('Borrador local simulado');

  // compare shows the three versions side by side
  await page.getByTestId('tab-comparar').click();
  await expect(page.getByTestId('letter-local')).toBeVisible();
  await expect(page.getByTestId('letter-cloud')).toBeVisible();
  await expect(page.getByTestId('letter-template')).toBeVisible();
});

test('el control final bloquea el envío si queda algo sensible', async ({ page }) => {
  const bodies: string[] = [];
  await mockCloud(page, bodies);
  await page.goto('/');
  await page.getByTestId('fill-example').click();
  // a count that equals the salary survives the generic redactor; the gate knows the salary
  await page.locator('textarea[name=logros]').fill('Mi app llegó a 15,000 usuarios activos.');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('cloud-status')).toContainText('Bloqueado');
  expect(bodies).toHaveLength(0);
  await expect(page.getByTestId('letter-template')).toBeVisible();
});

test('sin conexión: tras recargar, la nota y la plantilla siguen funcionando', async ({ page, context }) => {
  await page.goto('/');
  // wait until the service worker controls the page (app shell precached)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('status-network')).toContainText('Sin conexión');

  await page.getByTestId('fill-example').click();
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('cloud-status')).toContainText('Sin conexión');
  await expect(page.getByTestId('note')).toContainText('Ambiciosa');
  const template = page.getByTestId('letter-template');
  await expect(template).toContainText('Atentamente');
  const words = (await template.locator('.letter__text').textContent())!.split(/\s+/).filter(Boolean).length;
  expect(words).toBeGreaterThanOrEqual(250);
  await context.setOffline(false);
});
