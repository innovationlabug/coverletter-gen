import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

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

  // minimal form: five visible fields; name, achievements, offer and options fold under "Más detalles"
  for (const name of ['puestoDeseado', 'empresaDestino', 'salarioActual', 'salarioDeseado', 'aniosExperiencia']) {
    await expect(page.locator(`[name=${name}]`)).toBeVisible();
  }
  for (const name of ['nombre', 'puestoActual', 'empleadorActual', 'logros', 'oferta', 'soloDispositivo']) {
    await expect(page.locator(`[name=${name}]`)).toBeHidden();
  }
  await page.getByTestId('fill-example').click();
  await page.locator('summary', { hasText: 'Más detalles' }).click();
  await expect(page.locator('textarea[name=oferta]')).toBeVisible();
  await expect(page.locator('textarea[name=oferta]')).toHaveValue(/Telus International/);
  // no horizontal scroll, on desktop and on the phone
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

  // private note: verdict + one sentence + range to ask for + at most 2 tips; the rest under "Ver más"
  const note = page.getByTestId('note');
  await expect(note).toContainText('Tu nota privada');
  await expect(note.locator('.verdict')).toHaveText('Ambiciosa');
  await expect(note.locator('.verdict__sub')).toHaveText('Pides 26.7\u00a0% más que hoy: de Q15,000 a Q19,000.');
  await expect(note.locator('.range')).toContainText('Rango para pedir');
  await expect(note.locator('.range')).toContainText('Q19,000 – Q21,000');
  await expect(note.locator('.tips li:visible')).toHaveCount(2);
  await expect(note.locator('.tips li:visible').nth(1)).toContainText('La oferta publica Q18,000 – Q22,000');
  const hiddenTip = note.getByText(/^No reveles tu salario actual/);
  await expect(hiddenTip).toBeHidden();
  await note.getByText('Ver más').click();
  await expect(hiddenTip).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // plain-language version switcher: online + base (the local model is not downloaded yet)
  await expect(page.getByTestId('version-nube')).toBeChecked();
  await expect(page.getByTestId('version-local')).toBeHidden();
  await page.getByRole('radio', { name: 'Base' }).check();
  await expect(page.getByTestId('letter-template')).toContainText('Estimado equipo de Telus International');
  await expect(cloud).toHaveCount(0);

  // optional download (fake model in the e2e build) → the device version is written and shown
  await expect(page.getByTestId('model-load')).toHaveText(/^Usar sin internet \(\d+\.\d GB\)$/);
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
  await page.locator('summary', { hasText: 'Más detalles' }).click();
  await page.locator('textarea[name=logros]').fill('Mi app llegó a 15,000 usuarios activos.');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('letter-template')).toBeVisible();
  await expect(page.getByTestId('letter-notice')).toHaveText(
    'Como tu texto menciona una cifra de tu salario, te dejamos la versión base. Si quitas ese dato, puedes pedir la versión en línea.',
  );
  // only one letter exists, so there is nothing to switch
  await expect(page.locator('#versions')).toBeHidden();
  expect(bodies).toHaveLength(0);
  // next step: back to the form, on the field that holds the figure
  await page.getByTestId('notice-action').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu carta de interés');
  await expect(page.locator('textarea[name=logros]')).toBeFocused();
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
  await expect(page.getByTestId('letter-notice')).toHaveText(
    'No pudimos escribir la versión en línea esta vez. Te dejamos la versión base.',
  );
  await expect(page.getByTestId('letter-template')).toBeVisible();
  await expect(page.getByText(/App Check|401/)).toHaveCount(0);
  // a calm next step: try again (it fails again here, and says so again)
  await expect(page.getByTestId('notice-action')).toHaveText('Intentar de nuevo');
  await page.getByTestId('notice-action').click();
  await expect(page.getByTestId('letter-notice')).toHaveText(
    'No pudimos escribir la versión en línea esta vez. Te dejamos la versión base.',
  );
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
  await expect(page.locator('#form-error')).toHaveText('Faltan 5 datos para preparar tu carta.');
  // each field says what it needs, right under it, and is announced with the field
  await expect(page.locator('#e-puestoDeseado')).toHaveText('Escribe el puesto al que aplicas.');
  await expect(page.locator('#e-aniosExperiencia')).toContainText('0 si recién empiezas');
  await expect(page.locator('input[name=puestoDeseado]')).toBeFocused();
  await expect(page.locator('input[name=puestoDeseado]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('input[name=puestoDeseado]')).toHaveAttribute('aria-describedby', /e-puestoDeseado/);
  // fixing a field clears its message as you type
  await page.locator('input[name=puestoDeseado]').fill('Contadora');
  await expect(page.locator('#e-puestoDeseado')).toBeHidden();
  await expect(page.locator('input[name=puestoDeseado]')).not.toHaveAttribute('aria-invalid', 'true');
  // the optional fields never block
  await expect(page.locator('input[name=nombre]')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#paso-datos')).toBeVisible();
});

test('solo los cinco datos visibles bastan para una carta y una nota', async ({ page }) => {
  const bodies: string[] = [];
  await mockCloud(page, bodies);
  await page.goto('/');
  await page.locator('[name=puestoDeseado]').fill('Contadora');
  await page.locator('[name=empresaDestino]').fill('Cementos Progreso');
  await page.locator('[name=salarioActual]').fill('9,000');
  await page.locator('[name=salarioDeseado]').pressSequentially('10500');
  // money is formatted as you type
  await expect(page.locator('[name=salarioDeseado]')).toHaveValue('10,500');
  await page.locator('[name=aniosExperiencia]').fill('4');
  // Enter submits once everything is there
  await page.locator('[name=aniosExperiencia]').press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu carta para Cementos Progreso');
  await expect(page.getByTestId('letter-cloud')).toBeVisible();
  await expect(page.getByTestId('note').locator('.verdict')).toHaveText('Razonable');
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).not.toContain('9,000');
});

test('copiar avisa con "Copiada" y descargar baja la carta en .txt', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockCloud(page, []);
  await page.goto('/');
  await page.getByTestId('fill-example').click();
  await page.getByTestId('generate').click();
  const letter = page.getByTestId('letter-cloud');
  await expect(letter).toContainText('María José Castillo');
  const shown = (await letter.locator('.letter__text').textContent())!;

  await page.getByTestId('copy').click();
  await expect(page.getByTestId('toast')).toHaveText('Copiada');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]);
  expect(download.suggestedFilename()).toBe('carta-telus-international.txt');
  const saved = readFileSync((await download.path())!, 'utf8');
  expect(saved.replace(/\r\n/g, '\n')).toBe(shown);
});

test('marca "Sobre": sin el nombre de la creadora en la página, el título ni el manifiesto', async ({ page, request }) => {
  await mockCloud(page, []);
  await page.goto('/');
  await expect(page).toHaveTitle(/^Sobre/);
  await expect(page.locator('.brand')).toContainText('Sobre');
  const html = async () => (await page.content()) + (await page.evaluate(() => document.body.innerText));
  expect(await html()).not.toMatch(/emily/i);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toMatch(/^Sobre/);
  expect(manifest.short_name).toBe('Sobre');
  expect(JSON.stringify(manifest)).not.toMatch(/emily/i);
  // also after generating a letter, and in the privacy explainer
  await page.getByTestId('fill-example').click();
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('letter-cloud')).toBeVisible();
  await page.getByTestId('privacy-link').click();
  await expect(page.getByTestId('privacy-dialog')).toBeVisible();
  await expect(page.getByTestId('privacy-dialog')).not.toContainText(/Gemini|Gemma|App Check|Firebase|modelo/);
  expect(await html()).not.toMatch(/emily/i);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('privacy-dialog')).toBeHidden();
  await expect(page.getByTestId('privacy-link')).toBeFocused();
});

test('una ruta desconocida muestra una página amable con salida al inicio', async ({ page }) => {
  await page.goto('/no-existe');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Esta página no existe.');
  await expect(page).toHaveTitle(/no encontrada/);
  await page.getByRole('link', { name: 'Ir al inicio', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu carta de interés');
});
