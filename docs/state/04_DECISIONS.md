# Architecture Decisions (ADR-lite)

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

Format: **Context → Decision → Consequence → Status.** Mined from git history + code.

## ADR-001 — Low-cost single-service topology is the default
- **Context:** A full 8-service Render blueprint cost ~$48/mo; the owner wanted ~$6.
- **Decision:** `render.yaml` runs `indigold-api` as the one web service that hosts the
  worker, scheduler, radian, and encompass **in-process** (`RUN_WORKER`/`RUN_SCHEDULER`,
  embedded shared intelligence core). `render.full.yaml` keeps the 8-service scale-out.
- **Consequence:** ~$6/mo; the free API sleeps when idle (cold starts). Switching to
  scale-out needs **no code change** — the API auto-detects HTTP vs embedded via env.
- **Status:** Active (default). (`ba9f789`, `7f0c38f`)

## ADR-002 — Service worker bypasses ALL API traffic; version-bump rule
- **Context:** The Refresh button "sometimes worked." Root cause: the SW cached API
  GETs, so the vault showed stale/no data intermittently.
- **Decision:** The SW `isApi` check bypasses cache for every API path + the API host;
  API responses always hit the network. **Any SW change requires a cache-version bump.**
- **Consequence:** Reliable live data. Installed PWAs need a quit-reopen (×2) to pick up
  a new SW. (`603527b`; SW is v0.21.0 on main, v0.22.0 on the redesign PR.)
- **Status:** Active (load-bearing). See `05_DEBUGGING_LOG.md`.

## ADR-003 — Capture is instant; AI is asynchronous
- **Context:** A model call must never delay or fail a capture.
- **Decision:** Capture → store locally → sync → enqueue → enrich. The vault never waits
  on a model; a failed model call never fails a capture.
- **Consequence:** Local-first reliability; enrichment is eventual. RADIAN's governor
  **queues** work when over budget rather than blocking capture.
- **Status:** Active (iron rule). See `08_CONSTRAINTS.md`.

## ADR-004 — localStorage for captures, IndexedDB for file blobs
- **Context:** Captures are small JSON; files are binary and large.
- **Decision:** Capture records live in `localStorage` (`indigold_captures_v1`); file
  blobs + the Web Share Target payload live in IndexedDB (`indigold-share`).
- **Consequence:** Captures survive reload + airplane mode; files are retained offline
  and re-uploaded on refresh. The IDB schema must match `public/sw.js`'s inline code.
- **Status:** Active. (`3c3984a`; file queue on PR #1)

## ADR-005 — Two divergent capture entry routes, unified on the sync path
- **Context:** `/share` (zero-tap) and `/capture` (form + Save) classified the same but
  only `/share` synced; the iOS Shortcut uses `/capture`, so captures looked "(local)".
- **Decision:** Both routes persist via the same `persistCaptureFromParams`, and
  `/capture` Save now awaits `ensureSession()` + `syncCaptureToApi()` before navigating.
- **Consequence:** The Shortcut path syncs and shows real status. (`d9812d3`, `3ec8de1`)
- **Status:** Active.

## ADR-006 — Embedded SQL is the runtime schema; additive migrations only
- **Context:** Bundlers can't read files at runtime.
- **Decision:** `packages/db/src/schema.ts` exports `SCHEMA_SQL` (a string literal) — the
  **runtime** DDL applied idempotently on boot. `schema.sql` is the human mirror. New
  tables/columns are appended with `CREATE TABLE/ALTER … IF NOT EXISTS` to **both**.
- **Consequence:** Zero-downtime additive migrations; never a destructive migration.
- **Status:** Active (iron rule).

## ADR-007 — Model-adapter seam, no external AI until RADIAN 2.0
- **Context:** Founding commitment: model-agnostic, local-ownable, privacy-first.
- **Decision:** All AI behind an adapter; v0.1 ships a deterministic, vendor-free
  implementation so the platform runs with no keys. RADIAN 2.0 (PR #3) generalizes this
  to a **provider-agnostic `ModelAdapter`** (Anthropic/OpenAI/Gemini/OpenRouter/Ollama)
  with per-task routing, a budget governor, a cost ledger, and a versioned prompt registry.
- **Consequence:** Adding a provider touches zero pipeline code; the sandbox/CI run on
  stubs. (`apps/worker/src/lib/model.ts`; PR #3 `packages/shared/src/model.ts`+`providers.ts`)
- **Status:** Active on main (deterministic); generalized in PR #3.

## ADR-008 — AI proposes, thresholds dispose; execution is proposal-only
- **Context:** RADIAN must not silently mutate the graph or act outside the vault.
- **Decision:** Auto-apply only high-confidence classification/tags/MVS/edges; queue
  opportunities, merges, and generated plans for review. Stage-6 execution agents only
  **draft** artifacts (executors off by default); RADIAN never pushes code/PRs/write-APIs.
- **Consequence:** Safe autonomy; the owner stays in the loop. (PR #3)
- **Status:** Active (RADIAN).

## ADR-009 — Private R2 + signed URLs; device bearer token for uploads
- **Context:** Files are PII; the iOS Shortcut needs to authenticate uploads.
- **Decision:** R2 bucket is private-only (server-side public-write guard); files served
  via short-lived signed URLs. A silent per-device account mints a Bearer token (copyable
  on I/O) used for `/capture/upload`.
- **Consequence:** No public file links ever; the token is treated like a password.
  (`06536a7`, `c9ba2e3`) See `06_SECURITY.md`.
- **Status:** Active.

## ADR-010 — Dark-default "Vault" design + self-hosted fonts (PR #2)
- **Context:** Earlier light "Deep Space Observatory" theme + runtime Google Fonts.
- **Decision:** Dark-default token system (indigo-black + cream + single gold), light
  derived; self-host WOFF2 (Syne/Inter Tight/IBM Plex Mono) — no runtime font CDN.
- **Consequence:** Offline-ready fonts; coherent theme; AI-ism design bans enforced.
- **Status:** Proposed (PR #2, unmerged). Note: light theme was added first (`1822d42`)
  then dark made default in the redesign — a deliberate sequence to avoid shipping broken.
