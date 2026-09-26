/**
 * Regenerates docs/screenshots/ui-*.png (desktop 1440×900 and mobile 390×844: form, letter, note).
 *
 * Builds the app like the e2e suite (VITE_TEST_MODE=1, dummy Firebase config), serves it with
 * `vite preview` and intercepts the Firebase AI Logic endpoint with a realistic letter, so no
 * request reaches Google. Usage: npx tsx scripts/ui-screenshots.ts [--dark]
 */
import { chromium, type Page } from '@playwright/test';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dark = process.argv.includes('--dark');
const outDir = process.env.SHOTS_DIR ?? path.join(root, 'docs/screenshots');
const PORT = 4174;
const env = {
  ...process.env,
  VITE_TEST_MODE: '1',
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'test.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: '1:0:web:test',
  VITE_FIREBASE_MEASUREMENT_ID: '',
  VITE_RECAPTCHA_ENTERPRISE_KEY: '',
  VITE_APPCHECK_DEBUG_TOKEN: '',
};

const LETTER = `Estimado equipo de selección de Telus International:

Me dirijo a ustedes para presentar mi postulación al puesto de Data Engineer. Cuento con cinco años de experiencia como analista de datos, trabajando a diario con Python y SQL para convertir información dispersa en reportes confiables para la toma de decisiones.

Entre mis logros, automaticé en Python los reportes de cartera, lo que liberó 20 horas al mes para el equipo. También participé en la migración de 3 bases de datos a BigQuery sin tiempo de inactividad, una experiencia que se alinea con el trabajo en la nube que describe su oferta. Además, reduje en 30% los errores de conciliación mediante validaciones en SQL.

Me interesa especialmente el rol porque me permitiría dedicarme por completo a construir y orquestar pipelines de datos, un área en la que quiero seguir creciendo. Estoy familiarizada con los requisitos que mencionan y tengo muchas ganas de aprender a fondo Airflow junto a su equipo.

Quedo atenta a la posibilidad de conversar en una entrevista y ampliar sobre mi experiencia.

Atentamente,
{{NOMBRE}}`;

async function mockCloud(page: Page) {
  await page.route('**/firebasevertexai.googleapis.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: LETTER }] }, finishReason: 'STOP', index: 0 }],
      }),
    }),
  );
}

execSync('npx vite build --outDir dist-e2e', { cwd: root, env, stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  env,
  stdio: 'ignore',
});
const base = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch();
const suffix = dark ? '-dark' : '';
try {
  for (const [name, viewport, scale, mobile] of [
    ['desktop', { width: 1440, height: 900 }, 1, false],
    ['mobile', { width: 390, height: 844 }, 2, true],
  ] as const) {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: scale,
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: dark ? 'dark' : 'light',
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await mockCloud(page);
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.getByTestId('fill-example').click();
    await page.mouse.click(1, viewport.height - 1);
    await page.screenshot({ path: path.join(outDir, `ui-${name}-form${suffix}.png`) });

    await page.getByTestId('generate').click();
    await page.getByTestId('letter-cloud').waitFor();
    await page.screenshot({ path: path.join(outDir, `ui-${name}-letter${suffix}.png`) });

    const note = page.getByTestId('note');
    await note.getByText('Ver más').click();
    await note.evaluate((el, top) => el.scrollIntoView({ block: top ? 'start' : 'center' }), mobile);
    if (mobile) await page.evaluate(() => window.scrollBy(0, -16));
    await page.screenshot({ path: path.join(outDir, `ui-${name}-note${suffix}.png`) });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`screenshots written to ${path.relative(root, outDir)}`);
