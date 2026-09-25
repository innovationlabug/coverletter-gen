import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3217);

/**
 * e2e contra el build de producción (el service worker solo se registra en producción).
 * Las rutas /api/* se simulan con page.route: la prueba no depende de Ollama ni de Vertex.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    serviceWorkers: "allow",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { OLLAMA_URL: "", OLLAMA_TOKEN: "" },
  },
});
