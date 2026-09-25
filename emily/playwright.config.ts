import { defineConfig, devices } from '@playwright/test';

/**
 * e2e against the PRODUCTION build (vite build && vite preview), with:
 *  - VITE_TEST_MODE=1 → the local model is a deterministic fake (no 2.3 GB download);
 *  - the Firebase AI Logic endpoint intercepted with page.route (tests/e2e/app.spec.ts),
 *    so the real Firebase SDK code path runs but no request reaches Google.
 * Dummy Firebase config values are injected so the test does not depend on .env.local.
 */
const env = {
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

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
    env,
  },
});
