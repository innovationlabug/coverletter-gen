/**
 * Manual verification (not part of the test suite): opens the app served by `npm run dev`
 * in Chromium, fills the example profile and asks for the cloud letter through the REAL
 * Firebase AI Logic endpoint. Prints the HTTP status of the Firebase call, the error shown
 * in the UI (if any) and saves screenshots to .cache/screens/.
 * Usage: npm run dev   (other terminal)   then   npx tsx scripts/verify-cloud-browser.ts [url]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = path.resolve(import.meta.dirname, '../.cache/screens');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text().slice(0, 300));
});
page.on('response', async (r) => {
  if (r.url().includes('firebasevertexai.googleapis.com') || r.url().includes('firebaseappcheck')) {
    let body = '';
    try {
      body = (await r.text()).slice(0, 400);
    } catch {}
    console.log(`[http] ${r.status()} ${r.url().split('?')[0]}\n        ${body.replace(/\s+/g, ' ')}`);
  }
});
await page.goto(url);
await page.screenshot({ path: path.join(out, '01-empty.png'), fullPage: true });
await page.getByTestId('fill-example').click();
await page.getByTestId('generate').click();
await page.getByTestId('cloud-status').waitFor({ timeout: 90_000 });
console.log('[ui] cloud status:', await page.getByTestId('cloud-status').textContent());
console.log('[ui] letter panel:', (await page.getByTestId('letter').textContent())?.slice(0, 300));
await page.screenshot({ path: path.join(out, '02-result.png'), fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(out, '03-mobile.png'), fullPage: true });
await browser.close();
