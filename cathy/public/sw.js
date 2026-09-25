/*
 * Service worker de Cathy: app shell offline.
 * - install: precachea "/" + manifest + íconos, y además lee el HTML de "/" para precachear
 *   los chunks de /_next/static que ese HTML referencia (sus nombres cambian en cada build).
 * - fetch:
 *     /_next/static/*  → cache-first (archivos inmutables con hash)
 *     navegación       → network-first; sin red, la copia en caché de "/"
 *     /api/*           → NO se toca (siempre red; offline el cliente cae a heurísticas)
 */
const VERSION = "cathy-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

async function precache() {
  const cache = await caches.open(VERSION);
  await cache.addAll(SHELL);
  const html = await (await cache.match("/")).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all(
    [...new Set(assets)].map((url) => cache.add(url).catch(() => undefined)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === "/") {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/", { ignoreSearch: true }).then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
