// Renders the brand assets from one SVG mark with Playwright's Chromium:
//   public/icon.svg                      favicon (vector)
//   public/icons/icon-192.png, 512.png   PWA icons (rounded tile)
//   public/icons/icon-maskable-512.png   PWA maskable icon (full bleed, safe zone)
//   public/icons/apple-touch-icon.png    iOS home screen (180, full bleed)
//   public/og.png                        1200×630 Open Graph image
// Usage: node scripts/make-icons.mjs   (needs network once for the OG fonts)
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const JADE = "#0b6b58";
const COPY = "#a9bcf0";
const PAPER = "#fbfaf6";

/** The mark's sheets on a 32×32 grid (same geometry as src/components/Brand.tsx). */
const SHEETS = `
  <rect x="11" y="5.5" width="14.5" height="18" rx="2.5" fill="${COPY}"/>
  <rect x="6.5" y="9" width="14.5" height="18" rx="2.5" fill="${PAPER}"/>
  <path d="M16.3 15.45A3.6 3.6 0 1 0 16.3 20.55" fill="none" stroke="${JADE}" stroke-width="2.4" stroke-linecap="round"/>`;

/** rx: corner radius of the tile (0 = full bleed). scale: size of the sheets inside it. */
const markSvg = ({ size = 32, rx = 8, scale = 1 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <rect width="32" height="32" rx="${rx}" fill="${JADE}"/>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${SHEETS}
  </g>
</svg>`;

writeFileSync("public/icon.svg", markSvg() + "\n");
console.log("wrote public/icon.svg");

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [file, size, opts] of [
  ["public/icons/icon-192.png", 192, { rx: 7, scale: 1.04 }],
  ["public/icons/icon-512.png", 512, { rx: 7, scale: 1.04 }],
  // Maskable: the safe zone is the inner 80 %, so keep the sheets well inside.
  ["public/icons/icon-maskable-512.png", 512, { rx: 0, scale: 0.9 }],
  ["public/icons/apple-touch-icon.png", 180, { rx: 0, scale: 1 }],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markSvg({ size, ...opts })}</body></html>`,
  );
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
  console.log("wrote", file);
}

// ---------------------------------------------------------------- Open Graph
const og = `<!doctype html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #f6f7f5; color: #17211f;
         font-family: "Hanken Grotesk", system-ui, sans-serif; }
  .wrap { position: relative; height: 100%; padding: 64px 72px; display: grid; align-content: space-between; }
  .brand { display: flex; align-items: center; gap: 16px; font-family: Newsreader, Georgia, serif; font-size: 34px; font-weight: 500; letter-spacing: -0.01em; }
  h1 { font-family: Newsreader, Georgia, serif; font-weight: 400; font-size: 84px; line-height: 1.02; letter-spacing: -0.025em; max-width: 620px; }
  .lead { margin-top: 24px; font-size: 26px; line-height: 1.4; color: #56635f; max-width: 540px; }
  .foot { display: flex; align-items: center; gap: 10px; font-size: 22px; color: #0b6b58; font-weight: 500; }
  .stack { position: absolute; right: 72px; top: 92px; width: 380px; height: 470px; }
  .copy, .letter { position: absolute; width: 330px; border-radius: 18px; }
  .copy { right: 0; top: 0; height: 400px; background: #eef1fa; border: 1.5px solid #d0d9f0; transform: rotate(3deg); padding: 34px 32px; color: #2b4596; }
  .letter { left: 0; top: 56px; height: 410px; background: #fefefc; border: 1.5px solid #e2e6e3;
            box-shadow: 0 30px 60px -30px rgba(23,33,31,.35); padding: 40px 36px; transform: rotate(-2deg); }
  .l { height: 11px; border-radius: 6px; background: #e2e6e3; margin-bottom: 15px; }
  .l.ink { background: #17211f; opacity: .78; }
  .gap { height: 12px; }
  .label { font-size: 17px; font-weight: 500; color: #56635f; margin-bottom: 26px; }
  .copy .label { color: #4c5c94; text-align: right; }
  .sign { font-family: Newsreader, Georgia, serif; font-size: 30px; font-style: italic; color: #17211f; margin-top: 10px; }
</style></head><body><div class="wrap">
  <div class="brand">${markSvg({ size: 48 })}<span>Carta y copia</span></div>
  <div>
    <h1>Carta para ellos, nota para ti.</h1>
    <p class="lead">Tu carta de interés lista para enviar y una nota privada con cuánto pedir de salario.</p>
  </div>
  <p class="foot"><svg width="18" height="20" viewBox="0 0 11 12"><rect x="1" y="5" width="9" height="6.5" rx="1.5" fill="currentColor"/><path d="M3 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>Tu salario nunca sale de tu dispositivo.</p>
  <div class="stack" aria-hidden="true">
    <div class="copy"><p class="label">Solo para ti</p></div>
    <div class="letter">
      <p class="label">Tu carta</p>
      <div class="l ink" style="width:64%"></div><div class="gap"></div>
      <div class="l" style="width:100%"></div><div class="l" style="width:94%"></div><div class="l" style="width:98%"></div><div class="l" style="width:70%"></div>
      <div class="gap"></div>
      <div class="l" style="width:96%"></div><div class="l" style="width:88%"></div><div class="l" style="width:52%"></div>
      <div class="gap"></div>
      <div class="l" style="width:36%"></div>
      <p class="sign">Atentamente</p>
    </div>
  </div>
</div></body></html>`;

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(og, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "public/og.png" });
console.log("wrote public/og.png");

await browser.close();
