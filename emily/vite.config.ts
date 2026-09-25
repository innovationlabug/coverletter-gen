import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // transformers.js ships its own onnxruntime-web; pre-bundling it breaks the wasm/worker loading.
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Emily — Carta de interés',
        short_name: 'Carta Emily',
        description:
          'Generador de cartas de interés con nota privada de negociación. Tu salario nunca sale del dispositivo.',
        lang: 'es-GT',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4efe4',
        theme_color: '#1f3a2e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: everything the build emits (JS, CSS, fonts, icons). The worker bundle with
        // transformers.js is large, hence the raised limit. Model weights and the ONNX Runtime
        // wasm are NOT precached here: transformers.js stores them in Cache Storage itself.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
