> **ONE VAULT REALITY (latest):** fixed Safari↔installed-PWA divergence. **Root cause:** the PWA mints a *random* per-device account in localStorage and iOS gives the installed PWA a separate storage partition from Safari → two accounts → two vaults (not a cache bug). **Fix:** device **pairing code** (Settings → Vault sync & devices: copy on one surface, paste on the other → one shared vault) + Force Sync + sync-on-launch + stale/update banners + a Debug/Sync Status panel + SW re-audit (cache `v0.24.0`, no API cached) + build-version injection. 454/454; builds green ×3. **STOP — owner runs the pairing flow on device + confirms scenarios B/C** (`18_ONE_VAULT_REALITY.md`). Phase 3 blocked until convergence is confirmed.

> **(prior) PHASE 2 PREP:** vault-reset hardened — added the missing `jobs` table to the wipe (now WIPE(20)+preserved(`users`,`prompt_overrides`) = all 22 tables); self-tested on an ephemeral Postgres (dry-run counts, full `--apply` truncate, scoped `--user`). First-share doc refreshed; WIRED-vs-ASPIRATIONAL re-verified (no drift). **Owner runs the real Render dry-run/`--apply` + the two phone shares; do not wipe until owner says go.** 454/454.

> **(prior) PHASE 1 COMPLETE:** notification spine shipped to `main` (persistent Task Center survivor; SW API-bypass hardened to full namespace, cache `v0.23.0`) and **device-confirmed working** by owner. Follow-up: **TopBar safe-area cutoff fixed** (`height: calc(48px + env(safe-area-inset-top))`) so the top of the PWA no longer hides under the Dynamic Island. 454/454.

> **(prior) MAIN = COMPLETE UNION:** carried `vault-reset` (reset script + first-share doc) + `design-polish` unique bits (celebration, EmptyState, --elev-card, 12_DESIGN) onto `main`. Deferred-only (preserved on `architecture-rnd`): Task Center notification fix + BoardroomView. 454/454.

> **(prior) CONSOLIDATED:** `main` fast-forwarded to the full line (hardening P0–7 + live Claude + AURORA + AI Activity + ItemActions + Atlas canvas + Wave-6 Stage-1 media intake/SSRF). 35 merged branches pruned locally; dead `apps/scheduler` removed. Deferred for their own passes (preserved on `architecture-rnd`): the **Task Center notification fix** (known device bug — untouched) and **BoardroomView** (AURORA A5). Rollback: `git reset --hard f711706`. 454/454 green.

# Current State

`Last updated: 2026-06-14 · Commit: one-vault-reality · By: claude (Claude Code)`

> **Live-AI stabilization (ON MAIN):** global toasts (any route), canonical View routing, **AI Activity screen `/activity`** (engine room: view/retry/archive/delete), Atlas Back-to-full + 44px controls + safe-area, node item-actions, result persistence verified. 409/409. See `16_LIVE_STABILIZATION.md`. Pending device confirm.

> **AURORA A1–A15 (ON MAIN; A8 Atlas canvas done; deferred: notification fix + BoardroomView on `architecture-rnd`):** full UX/IA pass — 4-section Home, 5-tab bar + More/Insights, conversational Companion, Quests Today/Later/Archive, single Ask input, Situation Room, Time Machine panels, editorial Brief, skeletons, haptics, per-route scroll, colour-blind status, Home 4→1 fetch. Behaviour-preserving; 409/409. See `14_AURORA.md`. Superseded earlier A1+A9 note. **Pending owner eyeball.**
> **(prior) AURORA A1+A9:** Home decluttered to 4 sections; tab bar 8→5 (+`/more` hub, `/insights`); I/O→Settings (raw access under Advanced); per-route scroll restoration; colour-blind-safe status shapes. Behaviour-preserving (engines frozen); 409/409. **Pending owner IA confirmation before A2–A15.**

> **Wave 6 Stage 1 (ON MAIN):** Universal Intake Router (`detectIntake`/`planIntake`, mirrored) + SSRF guard (opt-in domain-limited yt-dlp) + `media_ingest` job auto-routed from share → honest Media nodes (extraction_pending/metadata_only/secret_kept_local; synthesizes via governedComplete when a transcript exists). No fabrication; capture instant. 454/454. Stages 2–7 (Whisper/yt-dlp/vision) gated on the Docker media worker + owner timing spike (`17_WAVE6_MEDIA_SPIKE.md`).

> **VERIFICATION + HARDENING arc — Phases 0–7 (ON MAIN); G12+ gated on owner greenlight.**
> - **P0 hygiene:** `scripts/dedupe-derived-nodes.ts` (dry-run default; **owner runs the dev-vault dry-run**); schema.ts byte-current; green baseline.
> - **P1:** `09_PHONE_GATES.md` — 17-gate owner walk-through checklist.
> - **P2:** `11_AI_AND_SCHEDULING.md` — free-tier scheduler delta (which jobs silently don't fire; fix = starter toggle) + governed-path audit (no key leaks; budget always queues; deterministic floor covers no-key AND mid-flight) + **on-device budget spend-by-purpose**.
> - **P3:** Home cold-load 4→2 requests (lazy panels); perf fix **locked** with a runtime guard + `queue-verify`; **8 handler early-returns that hung jobs now finish `skipped`**.
> - **P4 (design, on `claude/design-polish`, NOT merged):** spacing/type tokens, real `EmptyState`, quest-complete celebration, colour-blind-safe status shapes — for owner eyeball.
> - **P5:** `GET /radian/observability` + **/diagnostics** Verification Center (Stub/Build/Live/Phone) + Debug Console; error-transparency live-verified.
> - **P6:** centralized **privacy gate** (`governedComplete({localOnly})` keeps secret/internal local; sensitivity propagated to nodes; wired across ingest/contextualize/ask/assist/embed); security headers; error-detail redaction; `privacy-verify`. Audit in `06_SECURITY.md`.
> - **P7:** `13_ARCHITECTURE_AUDIT.md` — mirror-drift verdicts, dead-code/hotspots, **connector seam design**, bus-factor matrix. Gate verdict: sound for G12.
> - Matrix now **405/405** across 23 suites. **P8 (G12 Self-Evolution) needs explicit owner greenlight** (no autonomous code changes — ever).

> **Perf fix:** the embedded worker's blocking `BRPOPLPUSH` shared the main Redis client and stalled every API request (~15s) — the real cause of slow loads. `consume()` now uses a dedicated Redis connection; endpoints dropped to <20ms (5 concurrent Home requests = 37ms). One-line fix in `queue.ts`; worker still processes jobs.

> **Task Center:** in-app background tasks across ALL actions — trigger, leave the tab, it keeps running; a "Ready" pop-up (View/Snooze) surfaces it; snoozed → a tab bubble (clears on visit). `TaskProvider` + `TaskToast` + TabBar badges + `useTaskAction(kind,tab)` hook. Wired: Context Pack, Simulate, Research scan, Mentor, Quests Suggest, Companion verb jobs. Live-verified. (Home is API-bound ~12s under concurrent panel load on one process — background tasks make that painless; pre-existing.)

> **G11 Context Engineering (latest):** goal-scoped, token-budgeted, explainable retrieval — `POST /radian/context {goal}` packs only the relevant slice (semantic + lexical + recency + hot cache) and persists a context pack. Context tab "Goal-scoped context" builder. `context-engine-verify` 12/12; live e2e verified.

> **G10 Companion:** Mission Control gets a spoken commander's briefing — `GET /radian/briefing` (deterministic, from momentum/resurfaced/quests/focus/XP), "Brief me" reads it aloud via Speech Synthesis; + a "Teach me" long-press verb. `companion-verify` 12/12; live e2e verified.
> **G1 AI-completion gate: CLOSED in stub mode** — research lands a `derived_from` child node, ask/explain/challenge/teach give grounded answers, failures surface (job `failed`/`skipped`). Upgrades to live model output when a provider key is set.

> **G9 Mentor Mode:** "talk with past you" — deterministic first-person reflection (then/changed/wrong/advice/best_self) voiced from Time Machine + decisions/calibration + active focus. `POST /radian/mentor`; Mentor panel on the Time Machine page. `mentor-verify` 11/11; live e2e verified. Atlas-zoom click regression fixed (app-zoom excludes /atlas).

> **G8 Memory Palace:** Atlas alive — Legendary node state (radiant cornerstone), galaxy nebulae (skill-track clusters) + constellation edges, forgotten-gem glow + resurfaced pulse. Render-time, reduced-motion-safe, 60.6fps. `living-os-verify` 23/23; no API/schema changes.

> **G7 Simulation Engine:** synchronous deterministic "what happens if…?" → best/likely/worst probability estimates (sum 100) from real signals; `POST /radian/whatif`; Mission Control **Simulate** panel. Honest (estimates, not predictions). `simulation-engine-verify` 21/21; live e2e verified. The async `simulation` job remains the deep live path.

> **UX polish (latest):** global type bump (zoom 1.08 + bigger captions); persistent TopBar with Back/Forward; bigger Sheet X + Close button; Home stat tiles + progression track bars now navigate; `.tap-row` press affordance; honest cold-start loading copy. No logic changed.

> Keep this file SHORT and ruthlessly current. Prune stale lines. Truth levels:
> **🟢 live** = owner confirmed on device · **🟡 local** = headless/stub verified only.

## 🟡 ON `main` NOW (full app merged @ 019d887, deployed)
- Full app (file-upload + Vault redesign + RADIAN 2.0 + Cognition A–D + provider framework) is on `main` (release merge `6793efb`).
- 🟢 **pgvector live** (v0.8.1) — `GET /radian/pgvector-check`.
- 🟡 **Semantic memory** wired (`019d887`), OFF by default (deterministic, $0) until `RADIAN_EMBED=on` + a key.
- 🟢/🟡 **Living OS Wave G1**: UI gate **PASSED on device** (long-press → Companion, "Research this" fires, job queues, polling, no crash). **Backend completion gate PENDING** — research doesn't land a visible child node (root cause: `research` spawns re-ingested captures, not a child edged to the subject; also live AI is in stub mode without a provider key). Tracked for the provider/job-runner integration pass; does NOT block G2.
- 🟡 **Living OS Wave G2 — Time Machine** (`claude/living-os-g2`): `GET /radian/time-machine` + `/time-machine` PWA page (memory replay / change detection / decision reflection / resurfaced). **Deterministic — works in stub mode, no LLM dependency.** `time-machine-verify` 18/18; typecheck+build green; capture/upload/SW/Shortcut untouched. Pending owner live-gate.
- 🟡 **Living OS Wave G6 — Research Engine** (`claude/living-os-g6`): deterministic horizon planner (`research-engine.ts`) proposes next research **directions** per domain (honest, no fabricated findings, no network); `horizon_scan` worker job (weekly Mondays) + `POST /radian/horizon-scan` (sync) file a `horizon` brief + seed research quests; `GET /radian/horizon`. Closes the chain Research→Capture→Classify→Graph→Context Pack→Brief→Quest (existing `research` job is the live fetch path). PWA Research Horizon panel on Home. `research-engine-verify` 15/15; live e2e verified (6 directions + 3 research quests). No regressions; capture/upload/SW/Shortcut + G1–G5 untouched. Pending phone-gate.
- 🟡 **Living OS Wave G5 — Boardroom & Multi-Agent Council** (`claude/living-os-g5`): 6 personas (Strategist/Skeptic/Operator/Creative/Historian/Teacher) → Resolved action. **Deterministic + synchronous** (`POST /radian/boardroom`), works in stub mode (no provider key) — sidesteps the pending G1 live-AI gate. Companion Panel "Convene Boardroom" renders the synthesis inline + "Make it a quest". Persists a Boardroom node w/ provenance. `boardroom-verify` 15/15; live e2e verified (6 grounded lines render in-app). Capture/upload/SW/Shortcut + G1–G4 untouched. Pending phone-gate. **Next (owner priority): G11 Context Engineering → provider integration.**
- 🟡 **Living OS Wave G4 — Progression / Skill Tree / Playable Atlas** (`claude/living-os-g4`): deterministic XP engine (8 tracks, 6 levels), additive `xp_ledger` (provenance), project momentum; `GET /radian/progression`, quest-completion XP grants (idempotent), `GET /radian/quests/node-status`. PWA: Mission Control ProgressionPanel, quest-card XP/track/why, Atlas progress layer (diamond/check/momentum badges), Time Machine "progression over time". **No LLM.** `progression-verify` 32/32; quest regression 40/40; Atlas 60.7fps; live e2e verified (XP grant + idempotency + momentum). Capture/upload/SW/Shortcut + G1–G3 untouched. Pending owner phone-gate.
- 🟡/🟢 **Living OS Wave G3 — Quest / Action System** (`claude/living-os-g3`): additive `quests` table + state machine; `GET/POST /radian/quests*` (suggest/action/snooze/resume/convert-project, all event-backed); **dedicated `/quests` tab** (full board) + compact Mission Control panel; Time Machine "create quest?"; **Atlas shows the live vault** with quest gold-diamond badges + `?focus=` deep-link ("View on Atlas"). **Deterministic — no LLM dependency.** Routes code-split (initial bundle 98 KB gzip). `quests-verify` 40/40; live end-to-end verified (suggest/accept/snooze/complete/convert + reload persistence + Atlas focus/badge) on ephemeral PG+Redis in stub mode. Capture/upload/SW/Shortcut + G1/G2 untouched. UI gate passed on device; deeper live re-gate pending.

## ✅ VERIFIED WORKING (on `main` @ 603527b)
- 🟢 **Link/text capture sync** — iOS Shortcut → `/capture` form **Save** pushes to the API; saved to Postgres; on-screen status shows the real HTTP result.
- 🟢 **Universal Intake Queue** reads live backend captures; **Refresh button + pull-to-refresh** work (after the SW cache fix).
- 🟢 **Service worker v0.21.0** bypasses cache for ALL API traffic (the refresh fix).
- 🟢 **iOS Shortcut link/text path** (`/capture?raw=…`) — byte-for-byte stable contract.
- 🟢 **Backend round-trip** — silent per-device account auth, Postgres, and R2 storage all confirmed live.
- 🟢 **Light theme** + visible sync/refresh diagnostics.
- 🟡 **File-upload BACKEND** — `POST /capture/upload` → R2 + signed URLs exists on main (`06536a7`), plus "Copy API Token" on I/O. *No PWA file picker on main yet* (see IN PROGRESS).

## 🔨 IN PROGRESS (open PRs off `main`, NOT merged)
- **PR #1 `claude/indigold-file-upload`** — PWA file picker on `/capture`, offline IndexedDB upload queue, honest status, signed-URL re-request on expiry. *(headless 9/9, not yet live-confirmed.)*
- **PR #2 `claude/indigold-vault-redesign`** — dark-default "Vault" token system, self-hosted fonts, Atlas constellation (62fps@200), all screens; SW bumped **v0.22.0**. *(headless screenshots, not yet live-confirmed.)*
- **PR #3 `claude/radian-2.0`** — RADIAN intelligence layer Waves 0–4 + multi-provider LLM framework (Anthropic/OpenAI/Gemini/OpenRouter/Ollama), budget governor, cost ledger, prompt + Project Registry. *(108 stub checks green; deterministic until a key is set; not yet live.)*

## ⚠️ KNOWN ISSUES / doc-vs-code discrepancies
- **README §1/§5/§8 describe an older shape.** Code is truth: (a) the **default deploy is the low-cost 4-resource profile** (`render.yaml`) with worker/scheduler/radian/encompass **in-process in `indigold-api`**, not 8 separate services; (b) README §5's worker pipeline (`ingest→summarize/tag/graph`) is what runs **on main** — PR #3 replaces it with `ingest→contextualize→assist`; (c) README §8 "no external AI" is true on main, becomes provider-optional after PR #3.
- **Three PRs are unmerged** — `main` does NOT yet contain file-picker, the redesign, or RADIAN. Anything describing those as live is premature until the owner merges + live-tests.
- **"Verified locally" is not "verified live."** Most PR work is headless/stub-verified only; promote to 🟢 only after the owner's phone re-test (see `09_VERIFICATION.md`).
- **Two legacy prototypes remain in-tree** (`indigold-app/`, `Indigold_App/`) for reference; the canonical frontend is `apps/pwa`. Don't edit the legacy ones.
