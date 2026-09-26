// Nota: script histórico, escrito para la primera versión de la interfaz (ver docs/decisiones.md).
// Sus selectores ya no existen en la UI actual; se conserva como registro de cómo se verificó.
/**
 * Manual verification (not part of the test suite): loads the REAL local model in Chromium
 * through the app's Web Worker, writes the local draft for the example profile and reports
 * device (WebGPU/WASM), download/load time and generation time. Uses a persistent profile in
 * .cache/pw-profile so the 2.3 GB download happens only once. Also checks that, once cached,
 * the model loads with the network OFF.
 * Usage: npm run dev   then   npx tsx scripts/verify-local-browser.ts [url]
 */
import { chromium } from '@playwright/test';
import path from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const root = path.resolve(import.meta.dirname, '..');
const ctx = await chromium.launchPersistentContext(path.join(root, '.cache/pw-profile'), {
  headless: true,
  // full Chromium ("new headless") rather than chromium-headless-shell: closer to real Chrome
  channel: 'chromium',
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--ignore-gpu-blocklist'],
  viewport: { width: 1280, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300));
});
page.on('requestfailed', (r) => {
  if (!r.url().includes('firebasevertexai')) console.log('[requestfailed]', r.url().slice(0, 120), r.failure()?.errorText);
});
page.on('response', (r) => {
  if (r.url().includes('huggingface.co') || r.url().includes('jsdelivr')) console.log('[http]', r.status(), r.url().slice(0, 140));
});
await page.route('**/firebasevertexai.googleapis.com/**', (r) => r.abort());
await page.goto(url);
console.log('[gpu]', await page.evaluate(async () => Boolean((navigator as any).gpu && (await (navigator as any).gpu.requestAdapter()))));
await page.getByTestId('fill-example').click();
await page.getByTestId('generate').click();
await page.getByTestId('cloud-status').waitFor();

const t0 = Date.now();
await page.getByTestId('model-load').click();
let last = '';
const timer = setInterval(async () => {
  const s = (await page.locator('#model-bytes').textContent().catch(() => '')) ?? '';
  if (s && s !== last) console.log('[progress]', s);
  last = s;
}, 15_000);
await page.getByTestId('letter-local').locator('.letter__meta').filter({ hasText: 's en tu dispositivo' }).waitFor({ timeout: 45 * 60_000 });
clearInterval(timer);
console.log(`[total] ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log('[status]', await page.getByTestId('status-model').textContent());
console.log('[meta]', await page.getByTestId('letter-local').locator('.letter__meta').textContent());
console.log('[draft]\n' + (await page.getByTestId('letter-local').locator('.letter__text').textContent()));

// Offline reload: the cached model must load without network.
await ctx.setOffline(true);
await page.reload().catch(() => {});
await page.getByTestId('fill-example').click();
await page.getByTestId('generate').click();
await page.getByTestId('model-load').click();
const off = await page
  .getByTestId('status-model')
  .filter({ hasText: 'listo' })
  .waitFor({ timeout: 10 * 60_000 })
  .then(() => 'model loaded offline')
  .catch((e) => `offline load failed: ${e.message}`);
console.log('[offline]', off, '|', await page.locator('#model-desc').textContent());
await ctx.close();
