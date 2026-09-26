/**
 * Brand assets for "Sobre", rendered with Playwright's Chromium:
 *   public/icons/icon-192.png, icon-512.png   ← public/favicon.svg (rounded tile, transparent corners)
 *   public/icons/icon-maskable-512.png         ← full-bleed tile, mark inside the safe zone
 *   public/icons/apple-touch-icon.png (180)    ← full-bleed tile (iOS rounds it)
 *   public/og.png (1200×630)                   ← link preview
 * Usage: npx tsx scripts/make-icons.ts
 */
import { chromium } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const favicon = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');

const INK = '#1b2740';
const PAPER = '#f5f3ec';
const SEAL = '#8c2a42';
const DESK = '#eef0ea';
const FLAP = '#d8d3c3';
/** Header mark: ink envelope, lighter flap, wax seal. */
const MARK = `<svg viewBox="0 0 32 32"><clipPath id="m"><rect x="2.5" y="7" width="27" height="18.5" rx="3"/></clipPath><g clip-path="url(#m)"><rect x="2.5" y="7" width="27" height="18.5" fill="${INK}"/><path d="M1.6 6.2 16 17.4 30.4 6.2Z" fill="#3b4e75" stroke="${DESK}" stroke-width="1.2" stroke-linejoin="round"/></g><circle cx="16" cy="17.4" r="3.9" fill="${SEAL}" stroke="${DESK}" stroke-width="1.4"/></svg>`;

/** The envelope mark on a square, full-bleed tile; `scale` = mark width / tile width. */
function fullBleedTile(scale: number): string {
  const w = 42 * (scale / 0.656); // favicon mark is 42/64 wide
  const s = w / 42;
  const tx = 32 - 32 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${INK}"/>
  <g transform="translate(${tx} ${tx + 0.5 * s}) scale(${s})">
    <clipPath id="env"><rect x="11" y="18" width="42" height="29" rx="4.5"/></clipPath>
    <g clip-path="url(#env)"><rect x="11" y="18" width="42" height="29" fill="${PAPER}"/><path d="M11 18H53L32 34.2Z" fill="${FLAP}"/></g>
    <circle cx="32" cy="34.2" r="6.3" fill="${SEAL}" stroke="${PAPER}" stroke-width="2.2"/>
  </g>
</svg>`;
}

const fontUrl = (pkg: string, file: string) =>
  pathToFileURL(path.join(root, 'node_modules/@fontsource-variable', pkg, 'files', file)).href;

const LETTER = `Estimado equipo de selección:

Me dirijo a ustedes para presentar mi postulación al puesto de Data Engineer. Cuento con cinco años de experiencia convirtiendo datos dispersos en reportes confiables para la toma de decisiones.

Entre mis logros, automaticé los reportes del equipo y liberamos veinte horas al mes.`;

const og = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Fraunces'; src: url('${fontUrl('fraunces', 'fraunces-latin-opsz-normal.woff2')}') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Newsreader'; src: url('${fontUrl('newsreader', 'newsreader-latin-opsz-normal.woff2')}') format('woff2'); font-weight: 200 800; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; }
body { background: ${DESK}; color: ${INK}; font-family: 'Newsreader', Georgia, serif; font-optical-sizing: auto; position: relative; overflow: hidden; -webkit-font-smoothing: antialiased; }
.copy { position: absolute; left: 88px; top: 76px; width: 600px; }
.brand { display: flex; align-items: center; gap: 16px; }
.brand svg { width: 58px; height: 58px; }
.brand span { font-family: 'Fraunces', serif; font-size: 46px; font-weight: 580; letter-spacing: -0.02em; font-variation-settings: 'opsz' 48; }
h1 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 78px; line-height: 1.02; letter-spacing: -0.028em; font-variation-settings: 'opsz' 144; margin-top: 64px; }
p.sub { margin-top: 22px; font-size: 30px; line-height: 1.3; color: #525d73; width: 640px; }
p.promise { position: absolute; left: 88px; bottom: 64px; display: flex; align-items: center; gap: 12px; font-size: 23px; color: #525d73; }
p.promise svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.4; }
.scene { position: absolute; right: -40px; top: 58px; width: 470px; height: 600px; transform: rotate(4deg); transform-origin: 50% 100%; }
.sheet { position: absolute; left: 44px; top: 0; width: 382px; height: 420px; background: #fdfdfa; border-radius: 3px; box-shadow: 0 1px 2px rgb(27 39 64 / .08), 0 30px 60px -30px rgb(27 39 64 / .45); padding: 38px 36px; font-size: 17px; line-height: 1.62; white-space: pre-wrap; color: ${INK}; }
.env { position: absolute; left: 0; top: 262px; width: 470px; height: 300px; background: #e2e5dc; border-radius: 10px; box-shadow: 0 30px 60px -28px rgb(27 39 64 / .45), inset 0 0 0 1px rgb(27 39 64 / .06); }
.env svg { position: absolute; inset: 0; }
</style></head><body>
<div class="copy">
  <div class="brand">
    ${MARK}
    <span>Sobre</span>
  </div>
  <h1>Tu carta de interés, lista para enviar.</h1>
  <p class="sub">Y una nota privada para negociar tu salario.</p>
</div>
<p class="promise"><svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.6"/><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7"/></svg>Tu salario nunca sale de tu dispositivo.</p>
<div class="scene">
  <div class="sheet">${LETTER}</div>
  <div class="env">
    <svg viewBox="0 0 470 300"><path d="M14 16 235 168 456 16" fill="none" stroke="rgb(27 39 64 / .16)" stroke-width="2.5" stroke-linejoin="round"/><circle cx="235" cy="168" r="30" fill="${SEAL}"/><circle cx="235" cy="168" r="21" fill="none" stroke="rgb(255 255 255 / .22)" stroke-width="2"/></svg>
  </div>
</div>
</body></html>`;

const browser = await chromium.launch();
async function render(html: string, w: number, h: number, out: string, transparent = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const dir = mkdtempSync(path.join(tmpdir(), 'sobre-'));
  const file = path.join(dir, 'a.html');
  writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, out), omitBackground: transparent });
  await page.close();
}
const svgPage = (svg: string, size: number) =>
  `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;

for (const size of [192, 512]) await render(svgPage(favicon, size), size, size, `public/icons/icon-${size}.png`, true);
await render(svgPage(fullBleedTile(0.56), 512), 512, 512, 'public/icons/icon-maskable-512.png');
await render(svgPage(fullBleedTile(0.66), 180), 180, 180, 'public/icons/apple-touch-icon.png');
await render(og, 1200, 630, 'public/og.png');
await browser.close();
console.log('brand assets written');
