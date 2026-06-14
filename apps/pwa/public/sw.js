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

const CACHE = "indigold-v0.24.0";

const PRECACHE = [
  "/",
  "/manifest.json",
  "/fonts/inter-tight-var.woff2",
  "/fonts/syne-var.woff2",
  "/fonts/ibm-plex-mono-400.woff2",
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

// Lightweight message channel: the app asks the active SW for its cache version
// (shown in the Debug/Sync panel so you can confirm both surfaces run the same
// build) and can tell a waiting SW to activate immediately.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "VERSION") {
    event.ports?.[0]?.postMessage({ version: CACHE });
  } else if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ---- Web Share Target (POST) ----
// Manifest points share_target.action at /share-target (multipart). We can't run
// server code on a static host, so the SW captures the shared payload (text, url,
// files) into IndexedDB and 303-redirects to /share?pending=<id> for processing.
const SHARE_DB = "indigold-share";
function shareIdbPut(value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("pending", "readwrite");
      tx.objectStore("pending").put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const reqUrl = new URL(request.url);

  if (request.method === "POST" && reqUrl.pathname === "/share-target") {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();
          const id = "share_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
          const files = [];
          for (const f of form.getAll("files")) {
            if (f && typeof f === "object" && "name" in f) {
              files.push({ name: f.name, type: f.type, size: f.size, blob: f });
            }
          }
          await shareIdbPut({
            id,
            title: String(form.get("title") || ""),
            text: String(form.get("text") || ""),
            url: String(form.get("url") || ""),
            files,
          });
          return Response.redirect(new URL("/share?pending=" + id, self.location.origin).toString(), 303);
        } catch (e) {
          return Response.redirect(new URL("/share?error=share_failed", self.location.origin).toString(), 303);
        }
      })(),
    );
    return;
  }

  if (request.method !== "GET") return;

  const url = reqUrl;
  const sameOrigin = url.origin === self.location.origin;

  // NEVER cache API traffic — it must always hit the network so the vault shows
  // live data (caching it made refresh return stale/no data intermittently).
  // Matches the API host (any *onrender.com that isn't this PWA) and API paths.
  // Full API namespace — NEVER cache any of it (job polling especially: a cached
  // GET /radian/job/:id would freeze the poll on a stale status and the completion
  // toast would never fire). Cross-origin API is already bypassed by the host checks;
  // these path prefixes also cover a same-origin/relative API deploy.
  const isApi =
    /(^|\.)indigold-api\./.test(url.hostname) ||
    (url.hostname.endsWith(".onrender.com") && url.hostname !== self.location.hostname) ||
    /^\/(captures|auth|assets|capture|ready|health|nodes|edges|timeline|context-packs|briefs|usage|radian|llm|events|projects)(\/|$)/.test(url.pathname);
  if (isApi) {
    event.respondWith(fetch(request));
    return;
  }

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
