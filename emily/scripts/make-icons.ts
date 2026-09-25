/** Rasterises public/favicon.svg into the PWA PNG icons. Usage: npx tsx scripts/make-icons.ts */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const svg = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(root, `public/icons/icon-${size}.png`) });
  await page.close();
}
await browser.close();
console.log('icons written');
