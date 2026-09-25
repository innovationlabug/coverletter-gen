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

test('flujo completo: una carta a la vista, nota privada, versiones y descarga opcional', async ({ page }) => {
  const bodies: string[] = [];
  await mockCloud(page, bodies);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu carta de interés');

  // the removed, technical UI is gone
  await expect(page.getByText('Qué salió a la nube')).toHaveCount(0);
  await expect(page.getByText(/App Check|Gemini|Modelo local/)).toHaveCount(0);
  await expect(page.getByTestId('offline-banner')).toBeHidden();

  // the job offer is optional and folded away until needed
  await expect(page.locator('textarea[name=oferta]')).toBeHidden();
  await page.getByTestId('fill-example').click();
  await expect(page.locator('textarea[name=oferta]')).toBeVisible();
  await page.getByTestId('generate').click();

  // ONE letter by default: the online version, with the name restored on the device
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu carta para Telus International');
  const cloud = page.getByTestId('letter-cloud');
  await expect(cloud).toContainText('María José Castillo');
  await expect(cloud).not.toContainText('{{NOMBRE}}');
  await expect(page.getByTestId('letter-template')).toHaveCount(0);
  await expect(page.getByTestId('letter-notice')).toBeHidden();

  // what left the device: exactly one request, without salary / employer / name / third parties
  expect(bodies).toHaveLength(1);
  for (const form of SALARY_FORMS) expect(bodies[0].toLowerCase()).not.toContain(form);
  expect(bodies[0]).not.toMatch(/Banco Industrial/i);
  expect(bodies[0]).not.toContain('María José Castillo');
  expect(bodies[0]).not.toContain('Ana López');
  expect(bodies[0]).toContain('Telus International');

  // private note: verdict, key numbers, a few tips
  const note = page.getByTestId('note');
  await expect(note).toContainText('Tu nota privada');
  await expect(note.locator('.verdict')).toHaveText('Ambiciosa');
  await expect(note).toContainText('Q18,000 – Q22,000');
  const tips = await note.locator('.tips li').count();
  expect(tips).toBeGreaterThanOrEqual(2);
  expect(tips).toBeLessThanOrEqual(4);

  // plain-language version switcher: online + base (the local model is not downloaded yet)
  await expect(page.getByTestId('version-nube')).toBeChecked();
  await expect(page.getByTestId('version-local')).toBeHidden();
  await page.getByRole('radio', { name: 'Base' }).check();
  await expect(page.getByTestId('letter-template')).toContainText('Estimado equipo de Telus International');
  await expect(cloud).toHaveCount(0);

  // optional download (fake model in the e2e build) → the device version is written and shown
  await expect(page.getByTestId('model-card')).toContainText('Usar sin internet');
  await page.getByTestId('model-load').click();
  await expect(page.getByTestId('letter-local')).toContainText('Borrador local simulado');
  await expect(page.getByTestId('version-local')).toBeChecked();
  await expect(page.getByTestId('model-card')).toBeHidden();

  // back to the online version; copy works on the letter being shown
  await page.getByRole('radio', { name: 'En línea' }).check();
  await expect(page.getByTestId('letter-cloud')).toBeVisible();
  await expect(page.getByTestId('copy')).toBeEnabled();

  // "Cambiar mis datos" returns to the form with the values kept
  await page.getByTestId('edit').click();
  await expect(page.locator('input[name=nombre]')).toHaveValue('María José Castillo');
});

test('el control final bloquea el envío si queda algo sensible', async ({ page }) => {
  const bodies: string[] = [];
  await mockCloud(page, bodies);
  await page.goto('/');
  await page.getByTestId('fill-example').click();
  // a count that equals the salary survives the generic redactor; the gate knows the salary
  await page.locator('textarea[name=logros]').fill('Mi app llegó a 15,000 usuarios activos.');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('letter-template')).toBeVisible();
  await expect(page.getByTestId('letter-notice')).toHaveText(
    'Como tu texto menciona una cifra de tu salario, te dejamos la versión base. Si quitás ese dato, podés pedir la versión en línea.',
  );
  // only one letter exists, so there is nothing to switch
  await expect(page.locator('#versions')).toBeHidden();
  expect(bodies).toHaveLength(0);
});

test('si la nube falla, se explica en lenguaje simple y queda la versión base', async ({ page }) => {
  await page.route('**/firebasevertexai.googleapis.com/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 401, message: 'Firebase App Check token is invalid.', status: 'UNAUTHENTICATED' } }),
    }),
  );
  await page.goto('/');
  await page.getByTestId('fill-example').click();
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('letter-notice')).toHaveText('No pudimos generar la versión en línea; te dejamos la versión base.');
  await expect(page.getByTestId('letter-template')).toBeVisible();
  await expect(page.getByText(/App Check|401/)).toHaveCount(0);
});

test('sin conexión: tras recargar, la nota y la carta base siguen funcionando', async ({ page, context }) => {
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
  await expect(page.getByTestId('offline-banner')).toContainText('Sin conexión');

  await page.getByTestId('fill-example').click();
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('note').locator('.verdict')).toHaveText('Ambiciosa');
  const template = page.getByTestId('letter-template');
  await expect(template).toContainText('Atentamente');
  await expect(page.getByTestId('letter-notice')).toBeHidden();
  const words = (await template.locator('.letter__text').textContent())!.split(/\s+/).filter(Boolean).length;
  expect(words).toBeGreaterThanOrEqual(250);
  await context.setOffline(false);
});

test('sin datos: el formulario dice qué falta, sin salir de la página', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('generate').click();
  await expect(page.locator('#form-error')).toContainText('Te falta completar: tu nombre');
  await expect(page.locator('input[name=nombre]')).toBeFocused();
  await expect(page.locator('input[name=nombre]')).toHaveAttribute('aria-invalid', 'true');
});
