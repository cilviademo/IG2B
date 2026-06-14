# Debugging Log (institutional scar tissue)

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

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

