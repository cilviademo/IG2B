# Changelog

`Last updated: 2026-06-13 · Commit: living-os-g8 · By: claude (Claude Code)`

Append-only. Reconstructed from `git log --all`. Newest at the bottom of each section.
From now on, **every agent appends an entry per session** (date · agent · branch ·
commit(s) · what/why · live-test status).

## Reconstructed history (from git)

### Phase 0 — Prototypes
- `d0dbf85` Initial commit.
- `5f1ea42` Indigold v0.1 mobile-first PWA prototype (synthetic data only).
- `95236c2` v0.1 React PWA ("Deep Space Observatory", synthetic).
- `b36c0e1` iPhone-first capture workflow in Inbox.
- `6e96f0d` / `96dbf00` Self-contained single-file build (`indigold-local.html`) + file:// routing.
- `554ec77` / `90a574b` Liminal Atlas as Obsidian-style globe graph; curved edges, MVS pulse, layer clustering.

### Phase 1 — Render monorepo + deploy
- `0e1f0e4` Build as a Render multi-service monorepo (8 resources).
- `c9e5903` Normalize host-only Render service URLs to https (API CORS + PWA client).
- `ba9f789` Low-cost single-service topology (embedded worker/intelligence/scheduler).
- `7f0c38f` Default blueprint → free API + persistent Postgres (~$6/mo).
- `527d704` Fix API build on Render (force dev deps; NODE_ENV=production omits them).

### Phase 2 — Capture / Share / iOS Shortcut
- `1e7257d` Local Capture Test Mode (no backend).
- `abc9d80` `/capture` deep-link route for iOS Share Sheet / Shortcuts.
- `df21ce8` Zero-friction Share → auto-classify → Universal Intake Queue.
- `3c3984a` Real Web Share Target (POST + files) + local-first backend sync.
- `60111d7` Capture endpoint accepts shortcut params + auto-detects platform (one-tap Save).
- `32234ad` Backend-sync verifier + Capacitor iOS shell with Share Extension.
- `621eedd`/`60e4000`/`df9bab1`/`80a3b0e` iOS bridge fixes (appUrlOpen, auto-fill, start_url safety net).
- `17a137a` Shortcut source hint + keep-awake workflow.
- `6e349bc` Robust iOS Shortcut bridge: raw param + Debug Intake panel.
- `4bd170e` Auto-save share-sheet items; fix short-form video classification.
- `a8befc1` `/capture` success screen + Edit escape hatch + error fallback.

### Phase 3 — File capture backend + PWA↔API hardening
- `06536a7` **Part 2: private file/binary capture (S3-compatible storage, signed URLs).**
- `c9ba2e3` "Copy API Token" on the I/O page (for the Shortcut upload branch).
- `439c76c` Fix PWA→API reachability (CORS) + wire vault to live backend reads.
- `aae8e8e` Fix `VITE_API_URL` (expand bare Render service name → `*.onrender.com`).
- `8f5f357` Fix silent capture-sync failure: **401 re-mint + retry**, Test Sync diagnostic.
- `3ec8de1` Align share-sheet capture with the sync path + Inbox refresh + gate fixtures.
- `d9812d3` Fix the REAL share path: `/capture` form **Save now syncs** + shows live status.
- `3e382a9` Fix Refresh: keep last-good data on failed fetch (+ 401 retry).
- `1822d42` Light theme + pull-to-refresh + visible refresh diagnostics.
- `603527b` **Fix refresh: stop the service worker from caching API GETs** (+ reliable pull-to-refresh). ← `main` HEAD at analysis.

### Open PRs (branched off `main` @ 603527b; not merged)
- **PR #1 `claude/indigold-file-upload`** (`c921807`, `2180dd7`, `e8d8ccf`) — PWA file picker, offline upload queue, signed-URL refresh, headless verify (3×9/9), Shortcut file-branch docs.
- **PR #2 `claude/indigold-vault-redesign`** (`feb885a`, `4cd7079`, `e024b56`, `0952e52`, `4951892`, `b0b3fcc`) — Vault token system + self-hosted fonts, Atlas constellation, all screens, dark default, SW v0.22.0.
- **PR #3 `claude/radian-2.0`** (`75fa20e`, `455bb4c`, `3bd9052`, `7453682`, `540f5db`, `bcbe38e`) — RADIAN Waves 0–4 + multi-provider LLM framework; 108 stub checks.

## Session log (append below)

### 2026-06-12 · claude (Claude Code) · `claude/living-handoff-system`
- Created the Living Handoff System (`docs/state/` + `CLAUDE.md`/`AGENTS.md`/`.cursor` pointers + README section + changelog drift-guard CI). Reconstructed history from `git log --all`; opened PRs #1/#2/#3 for the three completed feature branches. Live-test status: docs only, no code paths changed.

### 2026-06-13 · claude (Claude Code) · `claude/cognition-expansion`
- **Cognition Wave A:** Event Store (append-only `events` + `emitEvent`, instrumented on capture/upload/worker), `GET /events` correlation replay, VectorStore seam (entity/tag; pgvector deferred), Phase-0 dedup map. Stub-tested 12/12. PR #5. Deltas in `directives/COGNITION_WAVEA_LOG.md`.

### 2026-06-13 · claude (Claude Code) · `claude/integration`
- **Integration trunk:** merged living-handoff + radian-2.0 (Waves 0–4 + provider framework) + cognition Wave A into one verified line. Resolved schema/index/handlers conflicts; re-instrumented the Event Store onto RADIAN's pipeline (node_created/classified/edge_created/brief_generated). All 7 stub suites green (120 checks); API+worker typecheck + bundle build green. This is the base for Cognition Waves B–D. Not yet owner-live-verified. PR #6.

### 2026-06-13 · claude (Claude Code) · Cognition Waves B/C/D (stacked on the trunk)
- **Wave B** (PR #7): constraint engine (injected into planning + reconciled), attention layer (`/radian/attention`), epistemic/causal/lifecycle vocabularies. 22/22.
- **Wave C** (PR #8): memory tiers (working/long_term/core, owner-confirmed), monthly/quarterly/annual compounding reviews, Shadow Memory resurrection (VectorStore seam), simulation grounding. 16/16.
- **Wave D** (PR #9): agent society (ADR-013, namespaced `actor`s), human-override constitution (ADR-014, injected into planning), wisdom "what matters" drift check (quarterly), export bundle (`GET /radian/export-bundle` + weekly job) + `docs/state/10_RESILIENCE.md` runbook. 14/14. Cognition A–D complete; 170 stub checks green.

### 2026-06-13 · claude (Claude Code) · `claude/semantic-memory` → main
- **Semantic memory enabled** (pgvector live, v0.8.1): embedding adapters (OpenAI text-embedding-3-small / Voyage voyage-3-lite / deterministic-32 fallback) behind `getEmbedder`; `embeddings` repo + `semanticNeighbors` (cosine; native pgvector `<=>` is a drop-in perf upgrade). New `embed` job (content-hashed, cheap, ledgered) enqueued after contextualize; `POST /radian/embeddings/backfill`, `GET /radian/embeddings` (status), `GET /radian/similar/:nodeId`. **OFF by default** (deterministic, $0) until `RADIAN_EMBED=on` + a provider key. Tests: semantic-verify 15/15; all 11 suites green. Live status: pending owner backfill + spot-check.

### 2026-06-13 · claude (Claude Code) · `claude/living-os-g1` → main
- **Living OS Wave G1 — "Inhabit, Don't Operate":**
  - **Companion Panel** (`POST /radian/ask` + `GET /radian/verbs/:entity` + `GET /radian/job/:id`): a verb router (Explain/Next steps/Research this/Simulate/Challenge/Create task/Context pack + freeform Ask) reachable on every node/project/brief/capture. Every verb maps to an EXISTING governed job (`ask`/`assist`/`research`/`simulation`/`context_pack`) or a sync `create_task`; results land as **child nodes with provenance** (+ `events`). The frontend makes **no direct model calls** — `CompanionPanel.tsx` only orchestrates + polls honest job state (queued/running/done/failed/budget_governor).
  - **Living Atlas node states**: `computeNodeState`/`deriveNodeState` (pure, render-time, zero model calls) classify each node Growing/Decaying/Blocked/Dormant/Emerging/Critical/Stable from data already on the client. Visuals via ring/glow/dim/badge; **pulse only for growing+critical and only when motion is allowed** (`reduceMotion` guard). A quiet "states" legend gives explainability.
  - **Phone-first interaction**: long-press a node (~500ms) → Companion Panel; "Ask Radian" buttons on the node sheet + capture detail.
  - **Mission Control voice**: Home rewritten into a commander's briefing — Situation → Detections → Recommended focus (numbered) → Risk — strictly from existing dashboard data (risk signals derived from the stat figures, **no fabricated insight**).
  - Pure core in `packages/shared/src/living-os.ts`, mirrored for the standalone PWA in `apps/pwa/src/lib/nodeState.ts`.
  - **Verification**: pwa+api+worker typecheck clean; pwa+api build green; `living-os-verify` 18/18; headless screenshots (Home + Atlas) render correctly; **Atlas 200-node synthetic = 60.8 fps**; reduced-motion path freezes drift + suppresses pulse. Capture/link/text/file-upload + Service Worker + iOS Shortcut path **untouched** (CaptureDetail change is a gated viewer button only). Live status: pending owner live-gate.

### 2026-06-13 · claude (Claude Code) · G1 phone-gate result + completion-gate diagnosis
- **G1 UI gate PASSED on device:** Atlas long-press opens the Companion Panel, the action sheet works, "Research this" fires, the job is created/queued, polling starts, no crash.
- **G1 backend completion gate PENDING:** a research job doesn't land a visible child node. Diagnosis (code-grounded; Render env values not readable from the sandbox):
  1. **LLM_MODE** — not set in `render.yaml`; `llmMode()` infers `live` only if a provider key is present, else **`stub`**. No provider key is declared in `render.yaml` → effectively **stub mode** unless one was added in the Render dashboard.
  2. **`GET /llm/status`** exists (returns `mode`, per-provider `configured`, default, budget — never the key). Owner can curl it to confirm mode/providers.
  3. **Provider key** — `ANTHROPIC_API_KEY` (or any LLM key) is **not** in `render.yaml`; must be set via dashboard. If absent → stub.
  4. **`/radian/ask` job type — correct.** "research" verb → enqueues job type `research` (`{nodeId}`/`{captureId}`) and records the Postgres job row with the same id.
  5. **Worker** runs in-process (`RUN_WORKER=true`) via `consume()` (Redis BRPOPLPUSH). NOTE: API is on the **free plan** → sleeps after ~15 min idle; the embedded worker only runs while awake (jobs persist + drain on next wake).
  6. **Adapter IS in stub/deterministic mode** without a key — the owner's hypothesis is correct: "live AI" is effectively off.
  7. **Budget governor NOT the blocker** — deterministic calls are $0; governor stays `ok`.
  8. **Failed-job surfacing** is partial: handlers expose `status`/`error` via `GET /radian/job/:id`, but a handler **early-return** (subject not found) or a **thrown** error leaves the Postgres job row stuck at `queued` (no `jobs.finish`), so the panel can't tell "stuck" from "in progress".
- **Root cause (the actual completion gap, independent of AI):** the **research verb never creates a child node edged to the subject** — `research` spawns *captures* (`radian_research`) that re-ingest into *separate, unlinked* nodes. So even on a successful (stub or live) run, no child appears hanging off the researched node, and the panel's "a child node was added" copy is inaccurate for `research`. The verbs that DO produce a provenance child are `explain`/`challenge`/`ask` (`askJob`) and `assist`.
- **Tracked as:** *G1 backend completion gate pending; revisit during provider/job-runner integration* (link research results back to the subject with a `derived_from`/`extends` edge + emit provenance; finish jobs on early-return/throw so failure is visible). **Not fixed now per owner; does not block G2.**

### 2026-06-13 · claude (Claude Code) · `claude/living-os-g2` → main
- **Living OS Wave G2 — Time Machine / Memory Replay** (deterministic; **works in stub mode**, never waits on an LLM):
  - Pure core `packages/shared/src/time-machine.ts` (+ PWA mirror `apps/pwa/src/lib/timeMachine.ts`): `windowFor`/`priorWindow`, `memoryReplay` ("what was I thinking then?"), `changeDetection` (new/faded themes, strengthened, abandoned, contradictions, missed follow-ups), `decisionReflection` ("where was I wrong?" — calibration over the existing decision journal; over/under-confidence + per-decision lessons), `resurfaced` (returned themes + forgotten high-value gems), and `timeMachine()` assembling all four.
  - **API**: `GET /radian/time-machine?range=7d|30d|90d|180d|365d|custom&days=N` assembles the owner's real data (Event Store + captures + nodes/edges + timeline + briefs + decisions) and runs the core. No new schema — the **decision journal already exists** (`decisions` table: decision/confidence/expected_outcome/outcome/outcome_success/status/review_by), so reflection is event-backed and provenance-preserving.
  - **PWA**: new `TimeMachine` page + route `/time-machine`, phone-first range chips, narrative (not tabular) output. Entry points added on **Timeline** (header pill) and **Home** (Mission Control header). Prefers the live API; falls back to deterministic local compute over the bundled vault so it always renders useful output.
  - **Verification**: pwa+api+worker typecheck clean; pwa+api build green; `time-machine-verify` 18/18; headless screenshot renders a real replay from the sample vault. Capture/link/text/file-upload + Service Worker + iOS Shortcut **untouched**; G1 Companion Panel/Atlas code untouched this wave.
  - **G1 integration note** recorded above: G1 UI shipped, G1 live-AI completion pending, **G2 does not depend on provider completion**; future G-module work should revisit the job-runner/provider completion gate.

### 2026-06-13 · claude (Claude Code) · `claude/living-os-g3` → main
- **Living OS Wave G3 — Quest / Action System** (deterministic-first; **no LLM required**): turns insights, brief recommendations, Companion outputs, Time Machine reflections and nodes into playable, stateful actions.
  - **Schema**: additive `quests` table (kind main/side/research/maintenance · state suggested/accepted/active/blocked/completed/archived · source_type · node_id anchor for Atlas badges · project_id · snooze_until · meta). `schema.ts` regenerated from `schema.sql`.
  - **Pure core** `packages/shared/src/quests.ts` (+ PWA mirror `apps/pwa/src/lib/quests.ts`): the state machine (`applyAction`/`canApply` — legal transitions only), `isInPlay`, `inferKind` (rule-based), suggestion builders (`questFromBrief/Node/Capture/TimeMachine/Companion`), `suggestQuests` (de-duped bulk), and kind/state visual styles.
  - **API** (`repo.quests` + routes, every change emits a `state_transition` event): `GET /radian/quests[?state=]`, `GET /radian/quests/node-ids` (Atlas badges), `POST /radian/quests` (create from a seed), `POST /radian/quests/suggest` (deterministic from latest brief + Time Machine forgotten gems + blocked nodes), `POST /radian/quests/:id/action` (accept/start/block/unblock/complete/archive — illegal transitions 409), `POST /radian/quests/:id/snooze`, `POST /radian/quests/:id/convert-project` (mints a Project + links the quest).
  - **PWA**: `QuestCard` (Accept/Snooze/Start/Complete/Convert-to-project, phone-first); `QuestsPanel` on **Mission Control** (today's Active + Blocked + Suggested with a one-tap Suggest); **Time Machine** "create quest?" on forgotten gems; **Atlas** gold-diamond badge on nodes with an in-play quest (static, reduced-motion-safe) + a legend entry.
  - **Verification**: pwa+api+worker typecheck clean; pwa+api build green; `quests-verify` 24/24; headless screenshots (Home/Atlas/Time Machine) render correctly; **Atlas 200-node = 60.9 fps**, reduced-motion intact. Capture/link/text/file-upload + Service Worker + iOS Shortcut **untouched**; G1 + G2 behavior preserved (changes additive). Live status: pending owner live-gate.
  - **G3 fix (sparse-vault quest generation):** phone gate found *Suggest* produced nothing on a real (sparse) vault — the generator was effectively fixture-shaped (only daily-brief actions + forgotten gems + blocked nodes, all empty early on). Rebuilt `suggestQuests` to draw from **inbox backlog, recommended focus, review queue (opportunities), high-MVS nodes, Time Machine resurfaced + forgotten gems, and active projects** (seeds the 8 default domains so a fresh vault has projects to act on), plus gentle first-decision / first-context-pack nudges. If still empty → **safe onboarding quests** (Triage Inbox · Review top node · Log first decision · Build first context pack · Run Time Machine). Live vault is the only source (never sample data); fully deterministic/stub-safe. `quests-verify` now **31/31**.
  - **G3 fix #2 (state-transition UX visibility):** phone gate found buttons worked but quests didn't visibly move (no Active/Snoozed/Completed/Converted sections; *Accept* landed in an ambiguous `accepted` state; completed quests vanished). Rebuilt `QuestsPanel` around a shared `questBucket()` (every quest → exactly one section, priority completed > converted > snoozed > blocked > active > suggested) with **six clearly-labelled sections + empty-state copy**, a **localStorage cache** for instant reload + persistence, and re-fetch after every action so cards move immediately. *Accept* now goes straight to **Active Today** (accept→start); added **Resume** (clears snooze) + a `/quests/:id/resume` route; **Completed** shows a checkmark + date; **Converted** shows the linked project. Atlas badge now fires only for **active/completed** node quests (not suggested), per spec #8.
  - **Resilience fix (found in live test):** a `POST /radian/quests` with an unknown `node_id` hit the FK and **crashed the API** (unhandled rejection). The create route now validates `node_id` against `nodes` and degrades to an unanchored quest instead of 500-ing.
  - **Live end-to-end verified** (ephemeral Postgres+Redis, `LLM_MODE=stub`, no provider key): suggest on a fresh vault → 5 quests; Accept→**Active**, Snooze→**Snoozed**, Complete→**Completed**, Convert→**Converted** (+project); illegal transition → 409; **fresh GET (reload) persists all states**; Atlas `node-ids` empty when suggested, returns the node once active. Screenshot `quests-live.png` shows the populated sections. `quests-verify` **40/40**.
  - **G3 polish (load time + dedicated Quests tab + Atlas linkage):** owner feedback after the gate.
    - **Faster load:** route-based code-splitting (`React.lazy` + `Suspense`) — initial bundle **126 KB → 98 KB gzip** (~22% smaller); heavy pages (Atlas canvas, Time Machine, I/O, Inbox) now download only when visited.
    - **Dedicated Quests tab** (`/quests` + nav entry): `QuestsPanel` gained a `variant="full"` board showing every section (Active / Blocked / Snoozed / Suggested / Converted / Completed / Archived) with no caps; the Home panel stays compact (in-play first, capped, "+N more →" links to the tab).
    - **Atlas shows your live vault** when the API is reachable (was sample-only) — falls back to the bundled sample offline; quest gold-diamond badges now land on **real** nodes.
    - **"View on Atlas"** on node-anchored quest cards → `/atlas?focus=<nodeId>`; the Atlas centers + selects (and opens the node sheet) once the layout settles (immediate under reduced-motion); focus survives the sample→live graph swap.
    - **Live-verified** (rebuilt PWA against the local API): Quests tab renders all sections with "View on Atlas"; `/atlas?focus=n_q1` loads the live 6-node graph, centers BTZ TRACE with its gold quest badge + node sheet. pwa typecheck + build green; capture/upload/SW/Shortcut + G1/G2 untouched.
  - **G3 polish #2 (collapsible sections):** owner asked for show/hide arrows on sections. New reusable `CollapsibleSection` (rotating chevron header; open/closed state persists in localStorage per section). Applied to **Quests** (every bucket + Archived; Completed & full-Suggested default-collapsed), **Mission Control** (Detections / Recommended focus / Risk), and the **Time Machine** (all four sections). Headless screenshots confirm the chevrons render; pwa typecheck + build green.

### 2026-06-13 · claude (Claude Code) · `claude/living-os-g4` → main
- **Living OS Wave G4 — Progression / Skill Tree / Playable Atlas** (deterministic + explainable; **no LLM dependency**):
  - **Pure engine** `packages/shared/src/progression.ts` (+ PWA mirror `apps/pwa/src/lib/progression.ts`): 8 **skill tracks** (AI Systems / Music Production / Business Systems / Military · Leadership / Learning · Research / Health · Personal Ops / Creative Output / Technical Build) with keyword `inferTracks`; **XP rules** (`questXp` main 25 / research 20 / side 15 / maintenance 10; `captureXp` = 3 + mvs bonus); **6 levels** Dormant→Core Identity (`levelFor` with progress + to-next); `computeTracks` (per-track XP from completed quests + nodes, split by source); **project momentum** (Dormant/Warming/Active/Accelerating/Blocked/At Risk/Compounding) via `momentumFor`; `progressionSummary` (deterministic narrative — gaining ≠ stalled) with **bootstrap copy** when sparse; `questReward` preview.
  - **Schema**: additive `xp_ledger` (track/amount/source/reason + created_at) — append-only provenance; display totals are recomputed from current data so they never drift. `schema.ts` regenerated.
  - **API**: completing a quest grants XP **once** (idempotent via `xp.hasGrant`) → ledger rows per inferred track + a `state_transition` event. `GET /radian/progression[?range=N]` returns tracks+levels, project momentum, today's XP, streak (consecutive UTC days), the summary narrative, and (with `range`) window XP deltas + accelerated/stalled projects for the Time Machine. `GET /radian/quests/node-status` → `{active, completed}` for distinct Atlas badges.
  - **PWA**: **Mission Control** `ProgressionPanel` (today's XP, streak, narrative, track bars w/ level + progress; collapsible); **Quest cards** show `+XP`, affected track(s) and a "why this matters" line; **Atlas** progress layer — active-quest gold diamond, completed-quest green check, project-momentum badge, skill-color accents, + legend (all static, reduced-motion-safe); **Time Machine** "Progression over time" section (strongest growing / faded track, accelerated / stalled project, window XP per track).
  - **No fake AI**: every number is computed from existing data; sparse vaults show "Progression will become more accurate as quests, captures, and reviews accumulate."
  - **Verification**: typecheck clean (pwa/api/worker); pwa+api build green; `progression-verify` **32/32**; **quest-transition regression `quests-verify` 40/40** (G3 buckets unchanged); **Atlas 200-node = 60.7 fps**, reduced-motion intact. **Live end-to-end** (ephemeral PG+Redis, stub mode): completing a quest → ledger row (right track + amount), idempotent (no double-grant), `todayXp`/streak/window deltas update, momentum computed; screenshots of Home / Quests / Atlas-focus / Time Machine. Capture/link/text/file-upload + Service Worker + iOS Shortcut **untouched**; G1/G2/G3 preserved. Live status: pending owner phone-gate.
  - **G4 polish (motion):** owner feedback — badges/bars were static (just greyed on select). Added reduced-motion-aware CSS utilities (`animate-pop` spring badge entrance, `pulse-soft` breathing for live markers, `bar-fill` width-grow, `press` tap feedback, `animate-flash`). Applied across the PWA: XP/level bars **grow from 0 on mount**; XP-today + streak chips + quest kind/XP badges **pop in**; active-quest state label breathes; the shared `Button` primitive gets press feedback app-wide; the **Atlas active-quest diamond now breathes** (size+alpha via the pulse phase) when motion is allowed. All gated by the global `prefers-reduced-motion` guard; Atlas still **60.5 fps**.

### 2026-06-13 · claude (Claude Code) · `claude/living-os-g5` → main
- **Living OS Wave G5 — Boardroom & Multi-Agent Council** (begins the Partner → Simulate → Adapt → Evolve arc): Radian becomes a six-persona team. **Deterministic + synchronous — works TODAY in stub mode with no provider key**, which also sidesteps the still-pending G1 live-AI job-completion gate.
  - **Pure engine** `packages/shared/src/boardroom.ts`: personas **Strategist / Skeptic / Operator / Creative / Historian / Teacher**, each producing a grounded line by transparent rules over the subject + graph signals (MVS, degree, recent edges, inbound blocks, recency, related node titles, project momentum, decision-calibration), converging on a single **Resolved** action with a concrete next-Friday deadline (Skeptic gates it when risk is high). Bootstrap copy when the subject is sparse. Clean seam to upgrade each persona to live model reasoning later — structure/contract stay.
  - **API**: `POST /radian/boardroom` (synchronous) resolves the subject (node/project/capture/brief), gathers signals from repos, runs the council, persists a **"Boardroom" node** (truth-layer C, `meta.boardroom`) + an `extends` edge for node subjects + a `review_generated` event, and returns the synthesis. No worker/polling — instant, deterministic.
  - **PWA**: Companion Panel gains a primary **"Convene Boardroom"** button that calls the synchronous endpoint and renders `BoardroomView` inline (six persona lines + a highlighted Resolved card) with a **"Make it a quest"** action (turns the resolved move into a G3 quest — ties the council into Progress). No on-device model calls.
  - **Verification**: typecheck clean (pwa/api/worker); pwa+api build green; `boardroom-verify` **15/15**; **quest-transition regression `quests-verify` 40/40** + `progression-verify` 32/32 (no regressions). **Live end-to-end** (ephemeral PG+Redis, `LLM_MODE=stub`, no key): convening on a real node returns all six grounded persona lines + a dated Resolved, persists the Boardroom node, and **renders in the Companion Panel** (verified via instrumented headless run — `board=lines:6`, Strategist…Teacher all on screen); screenshot `g5-boardroom.png`. Capture/link/text/file-upload + Service Worker + iOS Shortcut **untouched**; G1–G4 preserved. Live status: pending owner phone-gate.

### 2026-06-13 · claude (Claude Code) · `claude/living-os-g6` → main
- **Living OS Wave G6 — Research Engine** (ever-evolving knowledge loop): **Research → Capture → Classify → Graph → Context Pack → Brief → Quest**. **Deterministic + honest** — proposes WHAT to research; never fabricates findings; no network/LLM required (the live web-fetch path upgrades the same chain when tool adapters + a provider are connected).
  - **Pure planner** `packages/shared/src/research-engine.ts`: `sourcesForDomain` (keyword-mapped honest source types per domain — papers/repos/competitors/guidance/trends/tools/videos) + `horizonScan` (ranks the next research **directions** across active domains from graph gaps: no-research baseline, staleness, high-value-broaden), each carrying domain/topic/rationale/sourceType/priority. `RESEARCH_CHAIN` is the canonical loop.
  - **Worker + schedule**: new `horizon_scan` job (deterministic) files a `horizon` brief + seeds up to 3 research quests (dedup); the in-process scheduler enqueues it **weekly (Mondays)** alongside the other weekly jobs. (`Brief.kind` += `horizon`, `JobType` += `horizon_scan`.) The existing `research` job (Stage 4) remains the live fetch path: findings → `radian_research` captures → ingest → nodes → contextualize → context pack.
  - **API**: `POST /radian/horizon-scan` (synchronous manual scan → directions + persisted `horizon` brief + seeded research quests) and `GET /radian/horizon` (latest horizon + chain). Manual "Research this" already exists (Companion verb + `POST /radian/research/:nodeId`).
  - **PWA**: Mission Control **Research Horizon** panel (collapsible) — the chain breadcrumb, "Scan now", ranked directions with rationale, and a note when research quests are seeded → which appear in Quests (research quests grant Research-track XP on completion, closing into G4).
  - **Verification**: typecheck clean (pwa/api/worker); pwa+api build green; `research-engine-verify` **15/15**; regressions green (quests 40/40, progression 32/32, boardroom 15/15). **Live end-to-end** (ephemeral PG+Redis, stub mode): `POST /radian/horizon-scan` returned 6 domain-appropriate directions + the full chain, persisted a `horizon` brief, and seeded 3 `research` quests into Suggested; Home renders the Research Horizon panel (screenshot `g6-home.png`). Capture/upload/SW/Shortcut + G1–G5 untouched. Live status: pending owner phone-gate.

### 2026-06-13 · claude (Claude Code) · `claude/ux-polish` → main
- **UX polish pass** (owner feedback after G6 — applies across the whole PWA):
  - **Bigger type everywhere**: a modest global `zoom: 1.08` on the app shell (scales inline-px text that rem tweaks can't reach), body 14→15px / line-height 1.5, and `.cap-data` captions 0.6875→0.75rem. Layout intact (verified Home + Timeline).
  - **Back / forward navigation**: new persistent `TopBar` (sticky) with Back + Forward history arrows (Back greyed on Home) + the wordmark/current-screen label — so every screen has an explicit way to return, not just per-sheet close.
  - **Clearer close (X)**: `Sheet` now has a large circular bordered X **and** a full-width "Close" button at the end of the sheet.
  - **Items lead somewhere** (no more dead "grey on select"): Home **stat tiles** link to the relevant screen (Nodes/Projects/Edges→Atlas, Inbox→Inbox, Review→Quests); **progression track bars** link to Quests; added a `.tap-row` press/hover affordance for tappable rows; the shared `Button` already has `.press` feedback.
  - **Honest loading**: API-backed panels (Progression, Quests) note "free-tier API may be waking" while the (sleeping) free dyno cold-starts, so a slow first load reads as expected, not broken.
  - **Verification**: typecheck + build green; screenshots confirm larger type + TopBar (Back active on sub-pages); no logic changed (engines/regressions untouched). Capture/upload/SW/Shortcut + G1–G6 untouched. Note for phone-gate: confirm bottom-sheets position correctly under the global zoom.

### 2026-06-13 · claude (Claude Code) · `claude/living-os-g7` → main
- **Living OS Wave G7 — Simulation Engine** ("what happens if…?"): **synchronous + deterministic + honest** best / likely / worst with **probability estimates** computed by transparent rules from real graph signals — explicitly ESTIMATES, never predictions. Works in stub mode (no provider); the async `simulation` job stays the deeper live-reasoning path.
  - **Pure engine** `packages/shared/src/simulation-engine.ts`: `feasibilityFrom` (weighted momentum/MVS/constraint-fit/recency/degree → 0..1), `outcomesFor` (three bands whose probabilities **sum to 100**; higher feasibility shifts mass to best, lower to worst; likely keeps the most mass), `simulateScenario`, `simulateComparison` (scores + ranks options best-first), `parseOptions` ("A vs B vs C" / "A or B"), and `simulate` dispatch. Bootstrap copy + low confidence when data is sparse — no fabricated certainty.
  - **API**: `POST /radian/whatif` (synchronous) computes deterministic signals per option by matching projects/nodes (momentum via `momentumFor`, MVS, recency, degree), runs the engine, persists an **"Analysis"** node (`meta.simulation`, shows in `GET /radian/simulations`) + a `review_generated` event.
  - **PWA**: Mission Control **Simulate** panel (collapsible) — a "What happens if…?" input + project-derived scenario/comparison chips; renders **animated best/likely/worst probability bars**, a Recommendation card, and the assumptions (incl. the "ESTIMATES, not predictions" disclaimer).
  - **Verification**: typecheck clean (pwa/api/worker); pwa+api build green; `simulation-engine-verify` **21/21**; regressions green (quests 40/40, progression 32/32, boardroom 15/15, research 15/15). **Live end-to-end** (ephemeral PG+Redis, stub mode): scenario "focus BTZ TRACE" → best 39 / likely 40 / worst 21 (sum 100), conf 0.71, "Proceed"; comparison "BTZ TRACE vs Business vs Genesis" → ranked by real feasibility (81/65/29), "Lead with BTZ TRACE; hold Genesis"; the panel **renders in-app** (verified via instrumented run — `WHATIF:comparison:2`, Recommendation on screen); screenshot `g7-simulate.png`. Capture/upload/SW/Shortcut + G1–G6 untouched. Live status: pending owner phone-gate.

### 2026-06-13 · claude (Claude Code) · `claude/living-os-g8` → main
- **Living OS Wave G8 — Memory Palace**: the Atlas becomes alive. Deterministic, render-time, reduced-motion-safe, **60fps** — no LLM, no API/schema changes (pure renderer + node-state core).
  - **Legendary node state**: a cornerstone (`mvs ≥ 88 && degree ≥ 5`, or explicit core memory) — the brightest/rarest state (radiant gold ring + glow + gentle pulse + ★). Added to `computeNodeState` (after critical/blocked) + `NODE_STATE_STYLE` + `LEGEND`, mirrored in the PWA `nodeState.ts`.
  - **Galaxies**: nodes are clustered by dominant **skill track** (`inferTracks`/`trackColor`); a soft nebula radial-gradient is drawn behind each cluster (≤8, cheap). **Constellation lines**: same-cluster edges tint to the track colour.
  - **Forgotten gems glow** (high value gone quiet, `isForgottenGem`) — a gold halo even when dimmed, so they draw the eye instead of fading out. **Resurfaced ideas pulse** (`isResurfaced` — old idea freshly touched) — an expanding gold ring (motion only).
  - Atlas legend extended (Legendary auto-listed; gem/resurfaced + "galaxies = skill clusters / constellation lines" notes).
  - **Verification**: `living-os-verify` **23/23** (legendary precedence, pulse set {critical,growing,legendary}, ★ badge, gem/resurfaced helpers); all engine regressions green (quests/progression/boardroom/research/simulation); pwa typecheck + build green; **Atlas 200-node = 60.6 fps**, reduced-motion intact; live render shows BTZ TRACE as a Legendary cornerstone with constellation lines (screenshot `g8-atlas.png`). Capture/upload/SW/Shortcut + G1–G7 untouched. Live status: pending owner phone-gate.
