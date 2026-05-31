/* Indigold v0.1 — Service Worker
 *
 * Strategy:
 *   - App shell (index.html, styles.css, app.js, manifest, icons):
 *       Cache-first, falling back to network (then cache the fresh copy).
 *   - Static fixtures (sample_*, schemas/*, fake_vault/*):
 *       Cache-only (they never change in v0.1). Falls back to network ONLY
 *       to populate the cache on a cold miss — never to the public internet.
 *
 * Guardrails:
 *   - Zero external/CDN requests. Every cached URL is same-origin and relative.
 *   - No telemetry, no analytics, no cloud sync.
 */

const CACHE_VERSION = "indigold-v0.1.0";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// App shell — cache-first, kept fresh.
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-512-maskable.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon.svg"
];

// Static synthetic data — cache-only after install.
const DATA_ASSETS = [
  "./sample_nodes.json",
  "./sample_edges.json",
  "./sample_timeline.json",
  "./sample_context_pack.md",
  "./sample_dashboard.md",
  "./sample_weekly_brief.md",
  "./schemas/node.schema.json",
  "./schemas/edge.schema.json",
  "./schemas/memory.schema.json",
  "./schemas/context_pack.schema.json",
  "./fake_vault/01_RAW_ARCHIVE/field_notes_2026_01.md",
  "./fake_vault/02_KNOWLEDGE_ENGINE/person_a.md",
  "./fake_vault/02_KNOWLEDGE_ENGINE/person_b.md",
  "./fake_vault/02_KNOWLEDGE_ENGINE/generative_metaphors.md",
  "./fake_vault/02_KNOWLEDGE_ENGINE/memory_value_score.md",
  "./fake_vault/03_CONTEXT_ENGINE/context_engineering.md",
  "./fake_vault/04_PROJECTS/project_quartz.md",
  "./fake_vault/04_PROJECTS/project_atlas.md",
  "./fake_vault/04_PROJECTS/quartz_kickoff.md",
  "./fake_vault/05_IDENTITY_ENGINE/identity_profile.md",
  "./fake_vault/06_BOARDROOM_ENGINE/opportunity_alpha.md",
  "./fake_vault/06_BOARDROOM_ENGINE/decision_q1_pivot.md",
  "./fake_vault/07_SKILLS_LIBRARY/summarize.md"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL_ASSETS);
      const data = await caches.open(DATA_CACHE);
      await data.addAll(DATA_ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Hard guardrail: only ever handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isData =
    path.includes("/sample_") ||
    path.includes("/schemas/") ||
    path.includes("/fake_vault/");

  if (isData) {
    // Cache-only (cold-miss populate, then cache).
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        try {
          const res = await fetch(request);
          const cache = await caches.open(DATA_CACHE);
          cache.put(request, res.clone());
          return res;
        } catch (e) {
          return new Response(
            JSON.stringify({ error: "offline_and_uncached", path }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
      })()
    );
    return;
  }

  // Shell: cache-first, falling back to network, then refresh cache.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, res.clone());
        return res;
      } catch (e) {
        // Navigation fallback to the cached app shell.
        const fallback = await caches.match("./index.html");
        return fallback || Response.error();
      }
    })()
  );
});
