# Indigold — All-Encompassing Handoff

`Last updated: 2026-06-13 · By: claude (Claude Code) · Commit baseline: main @ f711706`

> Read this top-to-bottom before touching code. It's written so a fresh agent (Claude
> **or** ChatGPT) can be productive immediately. Pair it with the rest of `docs/state/`
> (especially `02_CURRENT_STATE.md`, `03_CHANGELOG.md`, `08_CONSTRAINTS.md`).

---

## 0. TL;DR

Indigold is a **local-first, AI-native Personal Intelligence OS**:
iPhone → Apple Shortcut → PWA → auto-classify → vault, with an intelligence layer
("RADIAN") and a "Living OS" of playable, deterministic features on top. It deploys on
Render as a **low-cost 4-resource monorepo**.

**The single most important design decision:** every intelligence feature is built
**deterministic-first**. Each engine produces a useful, honest result with **no LLM and no
network** (computed from data already in the vault), and **upgrades to live model output
automatically when a provider key is set**. This is why the whole app works today in
"stub mode" with zero API keys, and why nothing fabricates data.

**Current state:** Capture/sync/upload + RADIAN 2.0 + Cognition A–D + Living OS **G1–G11**
+ Task Center + a major perf fix are all on `main` and deployed. Stub/headless verified
throughout; **owner phone-gates are the real "done" bar** and several are still pending.

---

## 1. How to work in this repo (agent protocol)

1. **Read `docs/state/00_INDEX.md` → `02_CURRENT_STATE.md` → `08_CONSTRAINTS.md`** first,
   plus any file for your task area. Summarize current state back before changing code.
2. **After work:** append `03_CHANGELOG.md`, update `02_CURRENT_STATE.md`, log bugs in
   `05_DEBUGGING_LOG.md`, refresh header date stamps. *Work without a doc update is incomplete.*
3. **Branch + commit + push to `main`** is the established flow this project uses (the
   owner explicitly authorized pushing waves to `main`). Each wave: build on a
   `claude/<name>` branch, fast-forward `main`, push. End commit messages with the session
   URL footer (the harness enforces this).
4. **Do NOT create PRs** unless asked. Do not expose the model identifier in any pushed
   artifact (commits/PRs/code/docs) — chat replies only.
5. The canonical frontend is `apps/pwa`. `indigold-app/` and `Indigold_App/` are **legacy
   reference only — never edit them** (note: `indigold-app/` also hosts the bundled
   headless-Chrome used for screenshots — see §8).

---

## 2. Architecture & topology

**Monorepo (npm workspaces):**
- `apps/pwa` — React 19 + Vite + Tailwind v4 + Wouter + Sonner. The phone-first UI.
  Standalone build; **cannot import the `@indigold/shared` node barrel** (it pulls
  `ioredis`), so pure logic is **mirrored** into `apps/pwa/src/lib/*` (see §4/§5).
- `apps/api` — Express. Hosts the REST surface **and** (in the low-cost profile) the job
  **worker** + **scheduler** in-process.
- `apps/worker` — the same job handlers (`apps/worker/src/jobs/handlers.ts`); imported by
  the API in embedded mode, or run standalone in the scaled profile.
- `packages/shared` — all pure logic / contracts / engines (the brain). No DB.
- `packages/db` — Postgres client, repos, schema, migrator, the governed AI orchestrator.

**Render (default `render.yaml`, ~$6/mo):** `indigold-pwa` (static) · `indigold-api`
(node web, `RUN_WORKER=true RUN_SCHEDULER=true`) · `indigold-db` (Postgres) ·
`indigold-cache` (Redis/Key-Value). `render.full.yaml` scales worker/cron/services out
later with no code change. **Free API plan sleeps after ~15 min idle**; for always-on
background jobs + daily briefs, switch `indigold-api` to `starter` (~$7).

**Data flow / pipeline:**
`capture → ingest_capture → contextualize → (assist) → nodes+edges (graph) → embed →
context packs → briefs → quests`. Every pipeline write **emits an append-only event**
(`events` table) for replay/provenance.

**The governed AI path (single chokepoint):** `packages/db/src/ai.ts → governedComplete()`
→ budget governor (pre-flight + month-to-date from `ai_calls`) → provider adapter
(`packages/shared/src/providers.ts`) → cost ledger + usage. Throws `BudgetExceededError`
when over budget → callers **queue** (never fake). `LLM_MODE` = `stub | live | replay`
(inferred `live` if any provider key present, else `stub`). With no key, the adapter is
**deterministic** → engines fall back to their deterministic output.

---

## 3. Deterministic-first principle (read this twice)

Every Living OS engine (G5–G11, plus node-states G1/G8) is a **pure function** in
`packages/shared/src/*.ts` that takes data and returns a result. Rules:
- **No fabrication.** If data is sparse, return honest "bootstrap" copy, not invented facts.
- **Explainable.** Scores/decisions carry human-readable reasons.
- **Stub-safe.** Works with no provider key / no network.
- **Upgrade seam.** Where richer reasoning helps, the engine is the floor and
  `governedComplete` (live model) is the ceiling — wiring already in place via the worker.

This is why the app is demoable and trustworthy today, and why "provider integration" is
an *enhancement*, not a prerequisite.

---

## 4. Where everything is (exact file map)

### `packages/shared/src/` — engines & contracts (the brain)
- `types.ts` — `Job`/`JobType`, `Brief.kind`, capture/node/edge types. **Add new job types
  + brief kinds here.**
- `index.ts` — barrel re-exporting every engine. **Add `export * from "./x"` for new engines.**
- `model.ts` / `providers.ts` — ModelAdapter seam, multi-provider (Anthropic/OpenAI/Gemini/
  OpenRouter/Ollama), `LLM_MODE`, budget governor, per-task routing, `providersStatus()`.
- `queue.ts` — Redis-list job queue (`enqueue`, `consume`, `queueDepth`). **`consume()` uses
  a dedicated `redis().duplicate()` connection for the blocking `BRPOPLPUSH` — do not revert
  this (see §9 perf bug).**
- `redis.ts` / `kv.ts` — shared ioredis client (fail-fast, no offline queue).
- `events.ts` — Event Store types + `emitEvent` input shape.
- `embeddings.ts` / `vectorstore.ts` — embedding adapters (OpenAI/Voyage/deterministic-32),
  cosine rank; pgvector-ready.
- `intelligence.ts` — `forecast` (briefs) + `assemble` (Encompass context packs).
- `prompts.ts` / `registry.ts` / `contracts.ts` — prompt registry, seed projects, contracts.
- `radian-stages*.ts`, `cognition-b/c/d.ts` — RADIAN Waves 0–4 + Cognition Waves A–D
  deterministic logic (ingest/contextualize/assist/research/opportunity/simulation/reviews/
  constraints/attention/memory tiers/agent society/wisdom).
- **Living OS engines (the recent waves):**
  - `living-os.ts` — **G1** Companion verb router (`VERBS`, `verbsFor`, `findVerb`) **+ G1/G8
    node states** (`computeNodeState`, `NODE_STATE_STYLE`, `LEGEND`, `isForgottenGem`,
    `isResurfaced`). States: critical/legendary/blocked/growing/emerging/decaying/dormant/stable.
  - `time-machine.ts` — **G2** memory replay / change detection / decision reflection /
    resurfaced (`timeMachine`, `windowFor`, …).
  - `quests.ts` — **G3** quest state machine (`applyAction`, `questBucket`, `QUEST_KINDS/STATES`,
    suggestion builders, `suggestQuests`).
  - `progression.ts` — **G4** XP/tracks/levels/momentum (`computeTracks`, `levelFor`,
    `momentumFor`, `progressionSummary`, `questReward`, `inferTracks`, `trackColor`).
  - `boardroom.ts` — **G5** six-persona council (`boardroom`, `PERSONAS`).
  - `research-engine.ts` — **G6** horizon scan (`horizonScan`, `sourcesForDomain`, `RESEARCH_CHAIN`).
  - `simulation-engine.ts` — **G7** what-if (`simulate`, `assembleContext`-style `feasibilityFrom`,
    `outcomesFor`, `parseOptions`).
  - `mentor.ts` — **G9** "talk with past you" (`mentor`, `MENTOR_QUESTIONS`).
  - `companion.ts` — **G10** spoken briefing (`morningBriefing`, `timeGreeting`).
  - `context-engine.ts` — **G11** goal-scoped retrieval (`assembleContext`, `scoreCandidate`).
- `scripts/*-verify.ts` — **stub test per engine**. Run from repo root (see §8).

### `packages/db/src/`
- `schema.sql` — the canonical Postgres schema (idempotent `CREATE TABLE … IF NOT EXISTS`).
- `schema.ts` — **AUTO-EMBEDDED string** of schema.sql (bundle-safe, runtime source of truth).
  **After editing schema.sql you MUST regenerate schema.ts** (see §7).
- `repos.ts` — all repositories (captures/nodes/edges/timeline/contextPacks/briefs/jobs/
  events/decisions/opportunities/constraints/embeddings/**quests**/**xp**/…).
- `ai.ts` — `governedComplete`, `budgetStatus`, `semanticNeighbors`, `buildExportBundle`,
  `seedProjectsIfEmpty`.
- `client.ts` (pg pool + `query`), `migrate.ts`, `index.ts` (barrel).

### `apps/api/src/`
- `index.ts` — app wiring, CORS, middleware order, **embedded worker + scheduler bootstrap**.
- `routes/` — `auth.ts`, `data.ts` (captures/nodes/edges/timeline), `intelligence.ts`
  (context-packs/briefs/usage), `io.ts`, `upload.ts`, `events.ts`, `health.ts`,
  **`radian.ts`** (the big one: projects + all Living OS endpoints).
- `lib/scheduler.ts` — in-process daily/weekly/monthly fan-out (incl. weekly `horizon_scan`).
- `lib/storage.ts` — R2/S3 signed-URL uploads + privacy guard.
- `middleware/auth.ts` (silent per-device session), `middleware/ratelimit.ts` (fail-open).

### `apps/pwa/src/`
- `App.tsx` — router + providers. **`Shell`** applies the global `app-zoom` **except on
  `/atlas`** (zoom breaks canvas hit-testing — see §9). Wraps everything in `TaskProvider`,
  renders `TopBar` + `TaskToast` + `TabBar`.
- `index.css` — the Vault design system (tokens, fonts, animations, `prefers-reduced-motion`
  guard, `.app-zoom`, `.tap-row`, `.press`, `.animate-pop`, `.bar-fill`, etc.).
- `lib/api.ts` — the API client (`req`, `questReq`, all `getX/runX` helpers, `apiEnabled`,
  token handling). **Standalone fixtures mode when `VITE_API_URL` is unset.**
- `lib/*.ts` mirrors — `nodeState.ts` (mirrors living-os states), `progression.ts`,
  `quests.ts`, `timeMachine.ts` (mirror the shared engines for the PWA). **Keep in sync.**
- `contexts/TaskCenter.tsx` — the background-task/notification system (`TaskProvider`,
  `useTasks`, `useTaskAction(kind, tab)`).
- `pages/` — `Dashboard.tsx` (Home/Mission Control), `Atlas.tsx` (canvas Memory Palace),
  `TimeMachine.tsx`, `Quests.tsx`, `Inbox.tsx`, `Timeline.tsx`, `ContextPack.tsx`,
  `WeeklyBrief.tsx`, `ImportExport.tsx`, `CaptureDeepLink.tsx`, `Share.tsx`.
- `components/` — `TopBar`, `TabBar`, `TaskToast`, `Sheet`, `CollapsibleSection`,
  `CompanionPanel` + `BoardroomView`, `CompanionBrief`, `ProgressionPanel`, `QuestsPanel` +
  `QuestCard`, `ResearchPanel`, `SimulationPanel`, `MentorPanel`, `ContextBuilder`,
  `CaptureDetail`/`CaptureForm`, `primitives.tsx`, `State.tsx`, `ErrorBoundary.tsx`.

### `apps/worker/src/jobs/handlers.ts`
All async job handlers + the `handlers` map: `ingest_capture`, `contextualize`, `embed`,
`ask` (Companion verbs → child node + provenance), `context_pack`, `assist`, `research`
(→ linked "Research" child + re-ingested captures), `daily_brief`, reviews, `opportunity_scan`,
`consolidate`, `simulation`, `meta_review`, `horizon_scan`, `agent_task`, etc.

---

## 5. The waves — what each does + status

Truth levels: **🟢 owner-confirmed on device · 🟡 stub/headless verified only.**

- **Capture / sync / upload / Shortcut / SW** — 🟢 the foundation. Do not destabilize.
- **RADIAN 2.0 (Waves 0–4) + multi-provider framework** — 🟡 on main; deterministic until a key.
- **Cognition A–D** (event store, constraints, attention, memory tiers, reviews, agent
  society, wisdom, export bundle) — 🟡 on main.
- **Semantic memory** (pgvector live v0.8.1) — 🟡 OFF by default; `RADIAN_EMBED=on` + key.
- **G1 Companion Panel + Living Atlas node states** — 🟢 UI gate passed; **completion gate
  closed in stub mode** (research now lands a `derived_from` child; explain/teach/challenge/
  ask give grounded answers; failures surface as `failed`/`skipped`).
- **G2 Time Machine** · **G3 Quests** (state machine + sections + badges) · **G4 Progression/
  Skill Tree/Atlas badges** · **G5 Boardroom** · **G6 Research Engine** · **G7 Simulation** ·
  **G8 Memory Palace** (Legendary + galaxies + constellations + gem glow/resurfaced pulse) ·
  **G9 Mentor Mode** · **G10 Companion (voice briefing)** · **G11 Context Engineering** —
  all 🟡 on main, deterministic, live-verified on the local stack; **phone-gates pending**.
- **Task Center** (background tasks + in-app toast + tab badges; `useTaskAction` across
  Context/Simulate/Research/Mentor/Quests/Companion) — 🟡 verified.
- **Perf fix** (dedicated worker Redis connection) — 🟡 verified; biggest UX win.

Roadmap not yet built: **G12 Self-Evolution**, **G13 World-layer connectors**, **G14 Life
RPG**, **G15 Living OS**, and **provider integration** (the inflection that makes G5/G6/G7/
G9 reasoning live and closes the last bit of the G1 gate). See `07_ROADMAP.md`.

---

## 6. Hard rules (non-negotiable — from `08_CONSTRAINTS.md` + this session)

1. **Never change the iOS Shortcut link/text path** (`/capture?raw=…` is a byte-for-byte contract).
2. **The service worker NEVER caches API traffic.** Any SW change requires a cache-version bump.
3. **Capture is instant; AI is async.** A failed/slow model call must never fail a capture.
4. **No secrets in the repo** — Render env only. Never expose keys/tokens to the PWA or logs.
5. **The owner is the live gate** — "verified locally" ≠ done. Surface real errors on screen.
6. **Deterministic-first / no fabrication** — see §3. Sparse data → honest bootstrap copy.
7. **PWA cannot import `@indigold/shared`** — mirror pure logic into `apps/pwa/src/lib/*` and
   keep mirrors in sync.
8. **Blocking Redis commands get a dedicated connection** (never the shared client).
9. **CSS `zoom` is not applied to the Atlas route** (breaks canvas pointer hit-testing).
10. **Schema edits:** update `schema.sql` AND regenerate the embedded `schema.ts` (§7). Tables
    are additive (`IF NOT EXISTS`); migrations run on boot unless `RUN_MIGRATIONS=false`.

---

## 7. How to make common changes

- **New engine:** add `packages/shared/src/<x>.ts` (pure) → `export * from "./<x>"` in
  `index.ts` → a `scripts/<x>-verify.ts` stub test → if the PWA needs it, mirror to
  `apps/pwa/src/lib/<x>.ts`.
- **New API endpoint:** add to `apps/api/src/routes/radian.ts` (or the right route file).
  Auth is `requireAuth`; use `repo.*` + engines; `emitEvent` for provenance.
- **New job type:** add to `JobType` in `types.ts`, add a handler in
  `apps/worker/src/jobs/handlers.ts` + register in the `handlers` map; schedule in
  `apps/api/src/lib/scheduler.ts` if recurring. Handlers MUST call `repo.jobs.finish(...)`
  on every path (done/failed/skipped) so the Companion poll never hangs.
- **New table/column:** edit `packages/db/src/schema.sql`, then regenerate the embedded string:
  ```bash
  python3 -c "import json;sql=open('packages/db/src/schema.sql').read();open('packages/db/src/schema.ts','w').write('// AUTO-EMBEDDED from schema.sql (bundle-safe). Edit schema.sql then re-run\n// the embed step — this is the runtime source of truth.\nexport const SCHEMA_SQL = '+json.dumps(sql)+';\n')"
  ```
  then add the repo methods in `packages/db/src/repos.ts`.
- **New background-tasked UI action:** use `useTaskAction(kind, tab)` from
  `contexts/TaskCenter.tsx` — `const { start, busy, result } = useTaskAction("mykind","/tab")`,
  call `start(label, () => apiCall())`, render from `result`.

---

## 8. Verification (how to actually test — this matters)

**Stub tests (pure, no DB/network):** run from the **repo root** `/home/user/IG2B`
(a persisted `cd apps/api` breaks the relative path — recurring false-negative):
```bash
./apps/api/node_modules/.bin/tsx packages/shared/scripts/<name>-verify.ts
```
Current green suites: living-os 23, quests 40, progression 32, boardroom 15, research 15,
simulation 21, mentor 11, companion 12, context-engine 12, semantic 15 (+ wave0–4, cognition A–D).

**Typecheck / build:**
```bash
(cd apps/pwa && npx tsc --noEmit && npx vite build)
(cd apps/api && npx tsc --noEmit && npm run build)   # tsup bundle
(cd apps/worker && npx tsc --noEmit)
```

**Local live stack (ephemeral, for e2e):**
```bash
# Postgres (must run as the unprivileged 'postgres' user; root can't run initdb)
su -s /bin/bash postgres -c "/usr/lib/postgresql/*/bin/pg_ctl -D /tmp/ig_pg -o '-p 5599' -l /tmp/ig_pg.log start"
redis-server --port 6399 --daemonize yes
# API (background); use the Bash tool's run_in_background:true — a trailing '&'/disown
# gets SIGTERM'd at the call boundary in this harness (exit 144).
DATABASE_URL=postgres://postgres@127.0.0.1:5599/indigold REDIS_URL=redis://127.0.0.1:6399 \
SESSION_SECRET=dev-secret-dev-secret-dev-secret PWA_ORIGIN=http://localhost:8795 \
RUN_WORKER=true RUN_SCHEDULER=false PORT=7099 node apps/api/dist/index.js
```
- **CORS:** for the headless browser to hit the API you MUST set `PWA_ORIGIN=http://localhost:8795`
  (the screenshot server's origin). Without it, browser `fetch` is blocked (curl still works
  because it sends no `Origin`). This bit me repeatedly.
- **Tokens:** `POST /auth/login {email,password}` → `{token}`; inject into the page via
  `localStorage.setItem("indigold_token", TOK)` before navigation. Re-login fresh each
  session (stale token files cause "0 nodes" confusion).

**Headless screenshots / interaction:** `apps/pwa/scripts/screenshot.mjs` (puppeteer-core +
the Chrome at `indigold-app/.pptr/...`) serves `dist/` and shoots routes. For interactive
flows (clicking, typed inputs) write a one-off script that injects the token + uses
`page.evaluate` clicks. **Lessons:** poll for the *exact* rendered string (not page titles),
wait for each step before the next, and remember collapsible panels/cross-origin timing make
single-shot screenshots flaky — drive step-by-step.

**Always tear down + `rm -f dump.rdb apps/*/dump.rdb` (Redis writes it to cwd) before
committing.** Never commit `dist/` or `dump.rdb`.

---

## 9. What worked, what's flaky, what needs work (honest)

**Worked well**
- Deterministic-first paid off massively: every wave is demoable with zero keys, nothing
  fabricated, and 190+ stub assertions guard the logic.
- The pure-engine + thin-API + mirror-in-PWA pattern kept waves fast and low-risk.
- Live e2e on the ephemeral stack caught real bugs (below) that stub tests couldn't.

**Real bugs found & fixed this session**
- **Worker starved the API (the big one):** the embedded worker's blocking `BRPOPLPUSH`
  shared the main Redis client → every authed request stalled ~15s (login 22s). Fixed:
  dedicated `redis().duplicate()` in `consume()`. Endpoints → <20ms. **This was the real
  "slow to load," not the free tier.**
- **CSS `zoom` broke Atlas tapping:** the global type-zoom desynced canvas `clientX` vs
  `getBoundingClientRect()`. Fixed by excluding `/atlas` from `.app-zoom`.
- **G1 completion gate:** research used to spawn unlinked captures (no visible child) and
  jobs could hang at `queued`. Fixed: research lands a `derived_from` child; grounded
  deterministic answers; jobs finish `failed`/`skipped`; worker `onError` marks failed.
- Quest sparse-vault suggestions, quest section/transition UX, and several smaller items
  (see `03_CHANGELOG.md`).

**Flaky / environmental (not product bugs)**
- Headless interaction screenshots are timing/CORS-sensitive (see §8). The *features* render
  fine on device; the harness is the flaky part.
- The Bash tool SIGTERMs trailing-`&` background processes at the call boundary (exit 144);
  use `run_in_background:true`.

**Still needs work / pending**
- **Owner phone-gates** for G2–G11, Task Center, the perf fix, and the G1 completion gate
  (research→child, voice briefing, etc.). 🟡 → 🟢 only after device confirmation.
- **Provider integration** (real key) to make Boardroom/Research/Simulation/Mentor reasoning
  *live* and finish the G1 gate end-to-end. The seam exists; it needs a key in Render +
  light wiring/QA.
- **Home request fan-out:** ~5 panels fetch on mount. Now fast post-perf-fix, but lazy-/
  staggered-loading collapsed panels would further snappy it and cut API load.
- **Test-data noise:** the dev vault has many duplicate "Boardroom — BTZ TRACE" / "What-if"
  nodes from repeated verification; a real vault won't, but consider a cleanup/dedupe pass.
- Docs in `README`/older `docs/` still describe an earlier shape; `docs/state/` is truth.

---

## 10. Recommendations (priority order)

1. **Owner: run the pending phone-gates** (esp. G1 research→child, Quests, Atlas Memory
   Palace, Companion "Brief me", Task Center toast/badges). Promote 🟡→🟢 in `02_CURRENT_STATE.md`.
2. **Provider integration** — set a provider key in Render (`ANTHROPIC_API_KEY` etc.),
   confirm `GET /llm/status` shows `mode: live`, QA that ask/research/boardroom/mentor return
   model output (deterministic remains the floor). Highest leverage.
3. **Move `indigold-api` to `starter`** if you want reliable background jobs + daily briefs
   (free plan sleeps). Cheap, removes cold-start.
4. Then resume the roadmap: **G12 Self-Evolution** (monthly improvement memo — Meta-RADIAN
   already drafts one), **G13 connectors**, **G14 Life RPG** (achievements ride on the
   existing XP/quest/decision data).
5. Keep the deterministic-first discipline for every new wave.

---

## 11. Quick reference — key endpoints (all under `/radian`, `requireAuth`)

- Companion: `POST /ask` (verb router), `GET /job/:id`, `GET /verbs/:entity`, `POST /boardroom`.
- Quests: `GET /quests[?state=]`, `POST /quests`, `POST /quests/suggest`,
  `POST /quests/:id/action|snooze|resume|convert-project`, `GET /quests/node-ids|node-status`.
- Progression/Companion: `GET /progression[?range=N]`, `GET /briefing`.
- Time/Mentor/Sim/Research/Context: `GET /time-machine?range=`, `POST /mentor`,
  `POST /whatif`, `GET /horizon` + `POST /horizon-scan`, `POST /context`.
- Ops: `GET /status` (budget), `GET /llm/status`, `GET /radian/pgvector-check`,
  `GET/POST /embeddings*`, `GET /similar/:nodeId`, `GET /export-bundle`.

---

*If you change behavior, update `02_CURRENT_STATE.md` + `03_CHANGELOG.md` and re-run the
relevant `*-verify.ts`. The owner's device is the final word.*
