"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds only (in `next dev` a caching SW
 * would serve stale chunks). After activation it sends the URLs of the assets
 * this page already loaded, so the very first visit is enough to work offline.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (cancelled) return;
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && !u.includes("/api/"));
        reg.active?.postMessage({ type: "CACHE_URLS", urls: [location.href, ...urls] });
      })
      .catch(() => {
        /* offline support is a progressive enhancement */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
