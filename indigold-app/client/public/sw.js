/* Indigold v0.1 — service worker (HYBRID offline policy).
 *
 * - App shell + same-origin assets: cache-first, fall back to network, then cache.
 *   (Vite emits hashed asset names, so we cache on-demand rather than precaching a
 *   fixed list of build artifacts.)
 * - Synthetic fixtures (/data, /images, /icons, manifest): precached on install.
 * - Cross-origin (Google Fonts): stale-while-revalidate so fonts work offline
 *   after first load. This is the "hybrid" concession — first load needs network;
 *   the documented path to fully-local assets is to self-host the fonts.
 * - No analytics, no telemetry, no data exfiltration. */

const CACHE = "indigold-v0.1.0";

const PRECACHE = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/images/hero-dashboard.png",
  "/images/graph-constellation.png",
  "/images/timeline-header.png",
  "/images/weekly-brief.png",
  "/data/sample_nodes.json",
  "/data/sample_edges.json",
  "/data/sample_timeline.json",
  "/data/sample_inbox.json",
  "/data/sample_dashboard.json",
  "/data/sample_context_pack.json",
  "/data/sample_weekly_brief.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Best-effort: ignore individual misses (e.g. during dev).
      await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Cross-origin (fonts): stale-while-revalidate, best-effort.
  if (!sameOrigin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
    return;
  }

  // Navigations: network-first, fall back to cached app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (e) {
          const cache = await caches.open(CACHE);
          return (await cache.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Same-origin assets: cache-first, then network, then cache.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const res = await fetch(request);
        if (res && res.status === 200) cache.put(request, res.clone());
        return res;
      } catch (e) {
        return Response.error();
      }
    })(),
  );
});
