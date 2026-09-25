// Renders the app icons (PNG) from an inline SVG with Playwright's Chromium.
// Usage: node scripts/make-icons.mjs
import { chromium } from "@playwright/test";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="#26408f"/>
  <g transform="translate(${pad ? 256 : 256} 256) scale(${pad ? 0.72 : 0.9}) translate(-256 -256)">
    <rect x="170" y="130" width="220" height="280" rx="10" fill="#9db0f2"/>
    <rect x="122" y="96" width="220" height="280" rx="10" fill="#ffffff"/>
    <rect x="152" y="140" width="120" height="14" rx="7" fill="#26408f"/>
    <rect x="152" y="180" width="160" height="10" rx="5" fill="#c9d1dc"/>
    <rect x="152" y="206" width="160" height="10" rx="5" fill="#c9d1dc"/>
    <rect x="152" y="232" width="130" height="10" rx="5" fill="#c9d1dc"/>
    <rect x="152" y="258" width="150" height="10" rx="5" fill="#c9d1dc"/>
    <g transform="translate(318 318)">
      <circle r="58" fill="#0d7a63"/>
      <rect x="-24" y="-6" width="48" height="36" rx="6" fill="#ffffff"/>
      <path d="M-14 -6 v-10 a14 14 0 0 1 28 0 v10" fill="none" stroke="#ffffff" stroke-width="8"/>
    </g>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, maskable] of [
  ["public/icons/icon-192.png", 192, false],
  ["public/icons/icon-512.png", 512, false],
  ["public/icons/icon-maskable-512.png", 512, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(maskable).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`,
  );
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
  console.log("wrote", file);
}
await browser.close();
