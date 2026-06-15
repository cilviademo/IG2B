# Debugging Log (institutional scar tissue)

`Last updated: 2026-06-15 · Commit: model-timeout · By: claude (Claude Code)`

Every significant bug: **symptom → root cause → fix → LESSON.** Append-only.

## BUG-001 — Refresh "sometimes worked" (the SW API-cache incident)
- **Symptom:** The vault Refresh button + pull-to-refresh returned stale or no data
  intermittently; closing and reopening the PWA "fixed" it.
- **Root cause:** The service worker was caching API **GET** responses, so reads hit a
  stale cache instead of the network.
- **Fix:** `603527b` — SW now has an `isApi` check that **bypasses cache for ALL API
  traffic** (API host + API paths); only the app shell + fixtures are cached.
- **LESSON:** Never let the SW cache API traffic. **Any SW change requires a cache
  version bump**, and the installed PWA needs a **quit-reopen ×2** ritual to take it.

## BUG-002 — Captures looked "(local)", never synced (the real share path)
- **Symptom:** Items captured via the iOS Shortcut showed as local-only; backend stayed empty.
- **Root cause:** `/capture` (the route the Shortcut uses) persisted but **never called
  the API** — only `/share` synced. A separate `Share.tsx` race made it worse: it
  fired sync **fire-and-forget then navigated immediately**, unmounting before the
  request completed.
- **Fix:** `d9812d3`/`3ec8de1` — both routes share `persistCaptureFromParams`; `/capture`
  Save and `/share` now **await `ensureSession()` + `syncCaptureToApi()` before navigate**.
- **LESSON:** Await network work before unmount/navigate. There are TWO capture entry
  routes — fix both. Surface the **real HTTP status on screen**, never a silent "(local)".

## BUG-003 — Stale token → silent sync failure (Render KV session eviction)
- **Symptom:** Sync worked, then later failed silently; reopening sometimes helped.
- **Root cause:** Sessions live in Key Value (Redis). The free tier evicts under LRU, so
  a previously-valid Bearer token became unknown → 401, swallowed as a generic failure.
- **Fix:** `8f5f357` — on 401, **clear the token, re-mint the silent device session, and
  retry once**; added a visible "Test Sync" diagnostic that shows the exact HTTP status.
- **LESSON:** Treat KV sessions as evictable. Build 401 re-mint+retry into every
  authed call; expose the real status (`lastSessionError`/`lastSyncError`).

## BUG-004 — Cold-start blanked the vault
- **Symptom:** On a free-tier cold start (API asleep ~15 min), a refresh wiped the list.
- **Root cause:** A failed `fetchCaptures()` returned empty and overwrote good data.
- **Fix:** `3e382a9` — `fetchCaptures()` returns `null` on failure (vs `[]` for genuinely
  empty); the UI keeps last-good data and shows a "waking? retry in ~30s" status. The
  `.github/workflows/keepalive.yml` ping keeps the API warmer.
- **LESSON:** Distinguish "fetch failed" from "empty". Never blank live data on a
  transient error. Cold start is a normal state on the free tier — design for it.

## BUG-005 — PWA couldn't reach the API (`VITE_API_URL` + CORS)
- **Symptom:** "network/CORS Load failed" minting a token; PWA never reached the API.
- **Root cause (a):** `VITE_API_URL` was a **bare Render service name** (`indigold-api`,
  dotless, non-routable). **(b):** the API rejected the PWA's cross-origin requests.
- **Fix:** `aae8e8e` — `normalizeApiBase()` expands a dotless name → `*.onrender.com`,
  honors an explicit scheme, localhost→http. `439c76c` — CORS allows `*.onrender.com`
  origins + the `Authorization` header (Bearer, no cookies/credentials).
- **LESSON:** Validate the API base at runtime and **show it on screen**. The owner
  found this from the on-screen error message — surfacing real errors paid off.

## BUG-007 — "Couldn't reach Radian" hid the real reason
- **Symptom:** Every Radian ask showed "couldn't reach Radian (offline or API asleep)" — a
  fixed guess, regardless of the actual cause.
- **Root cause:** Radian clients return `null` on `!apiEnabled()` / no session / failed
  request; the UI printed a static string. The true reason (missing `VITE_API_URL`,
  expired session, HTTP/CORS) was known in `lastSessionError()` but thrown away; transport
  failures in `chatRadian`/`askRadian` weren't captured at all.
- **Fix:** `claude/honest-connectivity` — `api.ts` captures transport errors (`lastApiErr`)
  + exposes `connectivityError()` and a `probeApi()` `/health` check. Companion fallback +
  toasts show the real reason; `AppBanners` shows an "API not configured (sample data)" /
  "can't reach <host>" banner with Retry. (Same family as BUG-005: usually `VITE_API_URL`
  unset on the PWA static site, or a free-tier cold start.)
- **LESSON:** Never print a guessed cause. Surface the known error — the owner debugs from
  what's on screen (cf. BUG-005, BUG-006).

## BUG-009 — RADIAN "slow" under a live key (diagnosis + timeout guard)
- **Symptom:** RADIAN felt slow once a live provider key was connected (instant in stub mode).
- **Diagnosis (end-to-end trace, code evidence):** mostly **normal live-model latency**, not a
  plumbing bug. `/radian/chat` `await`s `governedComplete` **inline** (conversational reply must be
  in the response) → blocks for the full Sonnet generation (3–15s); stub was instant. `/radian/ask`
  is correctly **async** (enqueues, polls). Verified NOT causes: the Redis dedicated-connection
  regression is intact + self-asserting (`queue.ts:55`); the budget query is indexed
  (`ai_calls_user_month_idx`, range scan); the adapters do a single fetch with **no retry loop** (no
  silent 2–3× stacking). Real gaps: (a) **no client timeout** on the model fetch → a hung upstream
  could block indefinitely; (b) no chat streaming so latency is dead-air; (c) single-threaded worker
  serializes bursts; (d) free-tier cold start (owner/infra).
- **Fix (this PR):** `resolveModelTimeoutMs` (env `LLM_TIMEOUT_MS`, default 30s, clamp 3–120s) +
  `AbortController` on all live adapters (anthropic/openai-compat/gemini) → a slow/hung call aborts
  and the caller falls back to the deterministic floor or queues, never hangs. SSE streaming, worker
  concurrency, and the Render plan bump are noted as owner/infra follow-ups.
- **LESSON:** "live is slower" isn't a diagnosis — trace each hop. The one true *bug* class here was
  an unbounded external call; bound every provider fetch so the deterministic floor can engage.

## BUG-008 — Past conversations not viewable (archived hidden + no history surface)
- **Symptom:** owner could see an archived conversation referenced but couldn't open the actual
  Q&A; wanted a ChatGPT-style revisitable history.
- **Root cause:** durable `conversations`/`messages` persisted fine, but `conversations.list`
  excluded archived (`status<>'archived'`) with no unarchive path, and there was no discoverable
  "all chats" view — so archived threads became dead references. (Compounded by BUG-007 when the
  API was unreachable: nothing got persisted at all.)
- **Fix:** `claude/chat-history` — `/history` screen (search + archived toggle + restore), tap →
  full transcript in the Companion via `?conversation=` deep-link; `includeArchived` on list/search
  + `POST /conversations/:id/unarchive`.
- **LESSON:** "archived" must remain *retrievable*, and durable data needs a findable surface —
  persistence without a view is invisible. (Connectivity is the precondition — see BUG-007.)

## BUG-006 — Headless-green ≠ live-green (verification discipline)
- **Symptom:** Repeated fixes were "verified locally (headless)" then failed on device.
- **Root cause:** Headless stubs don't reproduce the SW, KV eviction, cold start, or the
  real cross-origin path. A "1/3 refresh" test artifact was actually the SW caching the
  stub's same-origin GET — which *led to discovering* BUG-001.
- **Fix/Practice:** Surface real HTTP status on-screen (Test Sync, sync-status line,
  refresh-status line). Only the **owner's live phone test** promotes work to ✅ VERIFIED.
- **LESSON:** In this project the owner is the live confirmation. Local green is a
  precondition, not "done". See `09_VERIFICATION.md`.

## (template for new entries)
### BUG-00X — <short title>
- **Symptom:** …
- **Root cause:** …
- **Fix:** `<commit>` — …
- **LESSON:** …


### 2026-06-14 · Unfinished job rows hang the poll (Phase 3.3)
- **Symptom:** a Companion/Task-Center action could poll `GET /radian/job/:id` forever — job stuck at `queued`, never `done`/`failed`.
- **Root cause:** 8 worker handlers had `if (!subject) return;` guards that exited WITHOUT calling `repo.jobs.finish(...)`, so the job row was never made terminal (only thrown errors hit `onError → failed`; a clean early-return slipped through).
- **Fix:** every such guard now `await repo.jobs.finish(job.id, "skipped", undefined, "subject_not_found")` (the existing pattern). Locked the related perf fix with a runtime guard in `queue.ts` + `queue-verify.ts` so the dedicated-Redis-connection invariant can't silently revert.
- **Lesson:** "job finished" must be an invariant of EVERY exit path, not just the happy path and the throw path. Grep `return;` in handlers when auditing.


### 2026-06-14 · Notification spine — capture sheet showed no AI lifecycle (Job 1)
- **Symptom (device):** Ask Radian on a capture → no completion toast, no tab badge; the Capture sheet showed only "Processed · Layer A" + an Ask Radian button, no running/queued/done state.
- **Diagnosis (chain traced):** the job chain itself is sound — single Ask path (CaptureDetail → CompanionPanel → `trackJob`), every worker handler reaches `repo.jobs.finish` on all paths (0 early-returns without finish, fixed earlier), `TaskProvider` wraps the shell, `TaskToast`/`TabBar`/bell mounted, the provider resume-polls `GET /radian/job/:id`. The real gaps: (1) lifecycle state lived ONLY inside the nested CompanionPanel and vanished when it closed — the Capture sheet itself reflected nothing; (2) a capture-subject Ask creates a child node with NO edge (captures aren't graph nodes), so the result was only reachable via the Task Center, not from the capture; (3) the toast was sticky with no auto-tuck.
- **Fix:** CaptureDetail now reads its own AI task from the Task Center and shows a persistent lifecycle block (working… → done/fallback/failed) with Open-result + Retry, independent of the panel. Toast auto-tucks into the bell after 8s (badge persists). (`assist` job already fixed to return `{child}` so "Open result" links to the Playbook.)
- **Verified:** headless — seeded a completed + a failed task; `/inbox` shows the toast (off-tab task), the bell badge (2), and tab badges on Atlas + Quests (`scripts/shots/notify-toast.png`). 409/409 verify; all builds green. Pending owner device confirmation.
- **Note:** if the device still shows nothing, suspect a stale Service Worker serving the pre-fix bundle — quit-reopen ×2 to update.

### 2026-06-14 — TopBar cut off under the Dynamic Island (safe-area subtraction)
- **Symptom (device):** the top of the PWA was cut off on iPhone — the back/forward arrows, title and notification bell were crushed/hidden under the status bar / Dynamic Island.
- **Root cause:** `TopBar` set a fixed `height: 48` while also carrying the `safe-top` class (`padding-top: env(safe-area-inset-top)`). Under the global `* { box-sizing: border-box }`, the notch inset was taken *out of* the 48px content box (padding eats into a fixed height) instead of being added above it, leaving only ~`48 − inset` px of usable bar.
- **Fix:** `apps/pwa/src/components/TopBar.tsx` → `height: calc(48px + env(safe-area-inset-top))`, so the bar is a full 48px of content **below** the inset. This is the same pattern `Atlas.tsx` already uses for its top overlay.
- **LESSON:** with `box-sizing: border-box`, a fixed-height element that also has `padding-top: env(safe-area-inset-top)` will *eat* its content; always fold the safe-area inset into the height (`calc(Hpx + env(...))`), never leave it as bare padding on a fixed-height box. Headless browsers report `env(safe-area-inset-*) = 0`, so this class of bug is invisible in screenshots — only the device shows it.

### 2026-06-14 — Safari and the installed PWA show different vaults (two anonymous accounts)
- **Symptom (device):** the Safari URL showed a freshly-captured Apple Note + its node + Atlas edge; the reinstalled home-screen PWA showed none of it. Owner correctly suspected it wasn't just a stale install.
- **Root cause:** the PWA has no login — `ensureSession()` (`apps/pwa/src/lib/api.ts`) silently mints a *random* device account (`device-<rand>@indigold.local`) into `localStorage` (`indigold_device`), and every server read is scoped to it. On iOS the installed home-screen PWA gets a **separate storage partition from Safari**, so each surface minted its OWN random account → two different users on the server → two different vaults. The Shortcut opens its capture link in Safari (default browser), so the capture landed under Safari's account; the PWA's partition had a fresh empty account.
- **Fix:** device **pairing code** (`lib/sync.ts`): `IG1.<base64url(creds)>` copied on one surface, pasted on the other, which then adopts the same account (replace creds → clearToken → ensureSession → forceSync). Both surfaces converge on one server vault. Plus Force Sync + sync-on-launch + stale/update banners + a Debug/Sync panel that surfaces the device-account email so the divergence is visible at a glance. SW re-audited (no API cached) + cache bumped `v0.24.0`.
- **LESSON:** "same origin" does NOT mean "same storage" on iOS — an installed PWA is a different storage partition than Safari. An app that auto-creates anonymous per-partition identities will silently fork into multiple vaults across a user's own surfaces. Anonymous device accounts need an explicit way to be *shared* (pairing/login), and the device-account identity must be visible in-app so this class of bug is diagnosable. Also: headless screenshots run with no `VITE_API_URL` and a single storage partition, so neither the multi-account split nor the live counts are reproducible there — only the device shows it.

### 2026-06-14 — Pairing didn't persist; a shared note "vanished" (anonymous-account fragility)
- **Symptom (device):** after pairing once, the installed PWA still needed the code re-pasted to sync, and a previously-shared Apple Note disappeared from BOTH Safari and the PWA.
- **Root cause:** identity was an anonymous, randomly-minted device account in `localStorage`. A PWA **reinstall wipes its storage**, and iOS can **evict** a PWA's localStorage — either drops the account, so the surface silently mints a NEW empty one. The note wasn't deleted; it's **orphaned on the server** under the discarded account (its random creds are gone, so nothing can authenticate as it). A pairing code can't survive a storage wipe, so it never "stuck."
- **Fix:** a real, recoverable **login** — `POST /auth/claim` upgrades the current account in place (set email+password on the same user id, data preserved); `/auth/login` restores it on any surface. Frontend uses a real `<form>` with Keychain `autocomplete` attrs so iOS/iCloud Keychain autofills+syncs the credential across Safari and the installed PWA. Also fixed Settings **Export** to back up the real vault (it had been exporting demo fixtures, so prior "backups" were worthless).
- **LESSON:** anonymous per-device identities are not durable on iOS — reinstall/eviction silently forks a NEW empty vault and **orphans** the old data (worse than visible deletion, because it's unrecoverable without the creds). Durable identity must be something the user can deterministically re-enter (login), and "Export/Backup" must dump REAL data, verified, before it's ever called a backup. Always make identity (the account email) and real counts visible in-app so this is diagnosable.
