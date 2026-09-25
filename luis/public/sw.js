/* Carta y copia — hand-written service worker (no build plugin).
 *
 * Strategy
 *  - install: precache "/", the manifest and icons, then parse the HTML of "/"
 *    and precache every /_next/static asset it references (JS, CSS, fonts).
 *  - navigations: network-first; on success refresh the cached shell, on
 *    failure serve the cached "/".
 *  - /_next/static/*: cache-first (file names are content-hashed).
 *  - other same-origin GETs (icons, manifest): stale-while-revalidate.
 *  - /api/* and non-GET requests are never touched: sensitive-free as they
 *    are, API answers must be fresh and the app has its own JSearch cache.
 */
const VERSION = "v1";
const SHELL_CACHE = `carta-shell-${VERSION}`;
const ASSET_CACHE = `carta-assets-${VERSION}`;
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

function assetUrlsFromHtml(html) {
  const found = new Set();
  const re = /\/_next\/static\/[^"'\s)\\]+/g;
  let m;
  while ((m = re.exec(html)) !== null) found.add(m[0]);
  return [...found];
}

async function cacheShellFrom(response) {
  const shell = await caches.open(SHELL_CACHE);
  await shell.put("/", response.clone());
  const html = await response.text();
  const assets = await caches.open(ASSET_CACHE);
  await Promise.all(
    assetUrlsFromHtml(html).map(async (url) => {
      if (await assets.match(url)) return;
      try {
        const res = await fetch(url);
        if (res.ok) await assets.put(url, res);
      } catch {
        /* ignore: best effort */
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_URLS.slice(1).map((u) => shell.add(u).catch(() => undefined)),
      );
      const res = await fetch("/", { cache: "no-store" });
      if (res.ok) await cacheShellFrom(res);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    (async () => {
      const assets = await caches.open(ASSET_CACHE);
      for (const raw of event.data.urls) {
        try {
          const url = new URL(raw, self.location.origin);
          if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) continue;
          if (!url.pathname.startsWith("/_next/static/")) continue;
          if (await assets.match(url.pathname)) continue;
          const res = await fetch(url.pathname);
          if (res.ok) await assets.put(url.pathname, res);
        } catch {
          /* ignore */
        }
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok && url.pathname === "/") event.waitUntil(cacheShellFrom(res.clone()));
          return res;
        } catch {
          const shell = await caches.open(SHELL_CACHE);
          return (await shell.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const assets = await caches.open(ASSET_CACHE);
        const hit = await assets.match(url.pathname);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) event.waitUntil(assets.put(url.pathname, res.clone()));
        return res;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const hit = await shell.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => {
          if (res.ok) shell.put(request, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (hit) {
        event.waitUntil(network);
        return hit;
      }
      return (await network) ?? Response.error();
    })(),
  );
});
