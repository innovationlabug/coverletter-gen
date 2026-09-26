import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Absolute origin for Open Graph / Twitter image URLs (scrapers need absolute URLs).
 * SITE_URL wins; on Vercel the production domain is exposed at build time; locally it stays
 * relative ("/og.png"), which is fine for development.
 */
const siteUrl = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
).replace(/\/$/, '');

const siteUrlPlugin = (): Plugin => ({
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
});

export default defineConfig({
  // transformers.js ships its own onnxruntime-web; pre-bundling it breaks the wasm/worker loading.
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
  plugins: [
    siteUrlPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registramos el SW desde main.ts (registerSW) para recargar sola cuando hay versión nueva.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Sobre · Tu carta de interés',
        short_name: 'Sobre',
        description: 'Tu carta de interés, lista para enviar, y una nota privada para negociar tu salario.',
        lang: 'es-GT',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['productivity', 'business'],
        background_color: '#eef0ea',
        theme_color: '#eef0ea',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: everything the build emits (JS, CSS, fonts, icons). The worker bundle with
        // transformers.js is large, hence the raised limit. Model weights and the ONNX Runtime
        // wasm are NOT precached here: transformers.js stores them in Cache Storage itself.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // The social preview image is for link scrapers, not for the app shell.
        globIgnores: ['og.png'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Toma control en la primera visita y activa versiones nuevas sin esperar a cerrar pestañas.
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
