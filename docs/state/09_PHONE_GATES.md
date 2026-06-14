# Phone Gates — the owner's live walk-through

`Last updated: 2026-06-14 · Commit: phase-1-phone-gates · By: claude (Claude Code)`

> **Companion to [`09_VERIFICATION.md`](09_VERIFICATION.md).** That file is the *ritual*
> (why "verified locally" ≠ "verified live", the quit-reopen-×2 SW dance, headless caveats).
> **This file is the *checklist*** — one row per subsystem, ordered so you can walk it
> top-to-bottom in a single phone session and flip each 🟡→🟢.
>
> **How to use:** open the PWA on your phone (the live Render deploy). Do the *Action*,
> confirm the *Expected on screen*, then set Status `🟢 + date` (or note the failure).
> Truth levels: 🟡 = headless/stub verified only · 🟢 = **you** confirmed on device.
>
> **Prereqs for the AI gates (G1, Boardroom-live, etc.):** a provider key must be set in
> the Render dashboard and `GET /llm/status` must report `mode: "live"`. Without a key the
> deterministic floor still works — those gates pass in *stub* mode, which is the honest
> baseline. Note which mode you tested in the Notes column.
> **Free-tier note:** the API sleeps after ~15 min idle; the first request after sleep can
> take ~30s (cold start) — that's expected, not a failure. Background/scheduled jobs only
> run while the dyno is awake (see Phase 2 / `01_OVERVIEW.md`).

---

## Walk order (do these top-to-bottom)

### 1 · Foundation (must pass before anything else means anything)

| # | Gate | Action on device | Expected on screen | Exercises | Status | Notes |
|---|------|------------------|--------------------|-----------|:------:|-------|
| 1 | **Capture (link/text)** | Run the iOS Shortcut on a link → it opens `/capture?raw=…` → tap **Save**. | Success screen with the **real HTTP result**; the item appears in the Inbox after refresh. | PWA `/capture` (`CaptureDeepLink`), `POST /captures`, Postgres | ⬜ | Byte-for-byte Shortcut contract — confirm params survive. |
| 2 | **Upload (file/binary)** | On `/capture` (or Share), pick a file/photo → Save. | Honest upload status; asset stored; signed-URL view works; survives offline→online (queued then synced). | PWA file picker, `POST /capture/upload`, R2, `GET /assets/:id/url` | ⬜ | Confirm no public URL is ever shown. |
| 3 | **Refresh / SW** | Pull-to-refresh the Inbox; force-quit + reopen ×2. | Fresh data loads; **no stale API responses** served from cache. | SW v0.21.0 (never caches API) | ⬜ | If you changed the SW, the version must have bumped. |

### 2 · Living OS waves (deterministic floor must pass even with no provider key)

| # | Gate | Action on device | Expected on screen | Exercises | Status | Notes |
|---|------|------------------|--------------------|-----------|:------:|-------|
| 4 | **G1 — Companion / research→child** | Long-press a node (~500ms) → Companion Panel → **Research this**. Wait, then reopen the node. | A **`derived_from` child node** ("Research — …") is **visibly attached** to the subject, AND the job **finishes** (not stuck `queued`). Failures show a real reason. | `POST /radian/ask` (verb→`research` job), worker `research` handler (child node + `derived_from` edge), `GET /radian/job/:id` | ⬜ | **The G1 completion gate.** Test in stub first; re-test with a live key. Watch for "stuck queued". |
| 5 | **G1 — Atlas node states** | Open `/atlas`; tap several nodes. | Ring/glow/dim/badge per state (Growing/Decaying/Blocked/Dormant/Emerging/Critical/Stable); **pulse only with motion allowed**; tapping a node opens its sheet (no zoom-broken hit-testing). | `apps/pwa/src/lib/nodeState.ts`, Atlas canvas | ⬜ | Confirm clicking still works (the zoom-on-/atlas regression). |
| 6 | **G2 — Time Machine** | `/time-machine`; switch range chips (7d/30d/90d/…). | Narrative memory replay / change detection / decision reflection / resurfaced — real data, not tabular dump. | `GET /radian/time-machine`, PWA `/time-machine` | ⬜ | Deterministic; works with no LLM. |
| 7 | **G3 — Quests** | `/quests`: tap **Suggest**; then Accept→Active, Snooze→Snoozed, Complete→Completed, Convert→Converted. Reload. | Quests **visibly move** between the six sections; **state persists through reload**; empty-state copy where empty. | `GET/POST /radian/quests*`, `quests` table | ⬜ | Suggest must produce ≥1 quest on a sparse vault. |
| 8 | **G4 — Progression** | Complete a quest; open Mission Control ProgressionPanel + Atlas. | XP grants **once** (no double on re-complete); track bars/level update; Atlas shows diamond/check/momentum badges. | `GET /radian/progression`, `xp_ledger`, `GET /radian/quests/node-status` | ⬜ | Confirm idempotency by completing the same quest twice. |
| 9 | **G5 — Boardroom** | Companion Panel → **Convene Boardroom** on a node. | Six grounded persona lines + a dated **Resolved** card; **Make it a quest** works. | `POST /radian/boardroom`, Boardroom node + `extends` edge | ⬜ | Synchronous; works in stub. |
| 10 | **G6 — Research Horizon** | Home → Research Horizon → **Scan now**. | Ranked research **directions** with rationale (no fabricated findings); research quests seeded into Suggested. | `POST /radian/horizon-scan`, `GET /radian/horizon` | ⬜ | Weekly job also fires this (Mondays) — see Phase 2. |
| 11 | **G7 — Simulation** | Mission Control → **Simulate** → "what happens if…?" (scenario + comparison). | best/likely/worst bars **sum to 100**; Recommendation; "ESTIMATES, not predictions" disclaimer. | `POST /radian/whatif`, Analysis node | ⬜ | Synchronous; honest. |
| 12 | **G8 — Atlas / Memory Palace** | `/atlas` with a populated vault. | Galaxy nebulae (skill clusters), constellation edges, legendary/forgotten-gem glow, resurfaced pulse; **60fps**; reduced-motion freezes it. | Atlas render layer (no API change) | ⬜ | Toggle iOS Reduce Motion to confirm the guard. |
| 13 | **G9 — Mentor** | Time Machine → Mentor panel → pick an intent (then/changed/wrong/advice/best_self). | First-person reflection (Past you / The record / Your best self) + points + a suggestion. | `POST /radian/mentor` | ⬜ | Deterministic from decisions/calibration/Time Machine. |
| 14 | **G10 — Companion voice** | Mission Control → **Brief me**. | A commander's briefing **read aloud** (Speech Synthesis) + on-screen text (greeting/lines/focus). | `GET /radian/briefing`, `CompanionBrief.tsx` | ⬜ | iOS may require a tap to allow audio. |
| 15 | **G11 — Context Engine** | Context tab → "Goal-scoped context" → enter a goal → build. | A token-budgeted pack of **only relevant** items, each with a reason; excluded count shown; persists. | `POST /radian/context`, `context_packs` | ⬜ | Deterministic ranking; semantic boost only if embeddings on. |

### 3 · Cross-cutting systems

| # | Gate | Action on device | Expected on screen | Exercises | Status | Notes |
|---|------|------------------|--------------------|-----------|:------:|-------|
| 16 | **Task Center** | Start any background action (e.g. Simulate), navigate to another tab. | The action keeps running; a **"Ready" toast** appears off-tab (View/Snooze); Snooze leaves a **tab badge** that clears on visit. | `TaskProvider`, `TaskToast`, TabBar badges | ⬜ | Try across ≥2 different actions/tabs. |
| 17 | **Worker-Redis perf fix** | Cold-load Home; tap around several API-backed panels. | Endpoints respond fast (no ~15s stalls); concurrent panel loads don't freeze each other. | `packages/shared/src/queue.ts` (dedicated Redis connection) | ⬜ | First load after sleep is cold-start (~30s) — separate from this. |

---

## Failure protocol

If a gate fails on device: capture the **on-screen error/status** (per Constraint #6 — real
errors must surface), note the gate # here, and log root-cause in
[`05_DEBUGGING_LOG.md`](05_DEBUGGING_LOG.md). Don't promote any dependent gate to 🟢 until
its prerequisite is 🟢. The in-app **Verification Center** (Phase 5) will mirror this table
from live status once the logic it reports on is green here first.
