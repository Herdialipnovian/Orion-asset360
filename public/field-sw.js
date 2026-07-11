/*
 * ORIGIN Asset360 Field — service worker.
 * Phase 1: installability + app-shell fallback, scoped to /field only (never
 * touches the CMS at / or the /api/* calls). Full offline mutation outbox +
 * asset/evidence precaching lands in Phase 4.
 */
const SHELL = "origin-field-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith("origin-field-") && k !== SHELL).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Only intercept navigations within /field. Network-first, cache the shell,
  // fall back to the last good /field document when offline.
  if (req.mode === "navigate" && url.pathname.startsWith("/field")) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put("/field", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/field").then(m => m || Response.error()))
    );
  }
});
