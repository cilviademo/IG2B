# Current State

`Last updated: 2026-06-13 · Commit: living-os-g7 (off main) · By: claude (Claude Code)`

> **G7 Simulation Engine (latest):** synchronous deterministic "what happens if…?" → best/likely/worst probability estimates (sum 100) from real signals; `POST /radian/whatif`; Mission Control **Simulate** panel. Honest (estimates, not predictions). `simulation-engine-verify` 21/21; live e2e verified. The async `simulation` job remains the deep live path.

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
