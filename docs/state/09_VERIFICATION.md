# Verification

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

**"Done" means the owner confirmed it live on device** — not local green. Local checks are
necessary but not sufficient (see BUG-006).

## Levels of truth
- 🟡 **Local / headless / stub** — typecheck, build, stub tests, headless screenshots. Catches
  wiring regressions. Does **not** reproduce the SW, KV eviction, cold start, or the real
  cross-origin path.
- 🟢 **Live (owner)** — the owner runs it on their iPhone against the deployed Render stack.
  Only this promotes an item to ✅ VERIFIED in `02_CURRENT_STATE.md`.

## Local techniques in this repo
- **Stub / deterministic mode:** the whole platform runs with no keys (deterministic model +
  intelligence stubs). RADIAN adds `LLM_MODE=stub|live|replay` — tests never call a real model.
- **Stub test suites (RADIAN, PR #3):** `packages/shared/scripts/{wave0,providers,wave1,wave2,
  wave3,wave4}-verify.ts` — run with `./apps/api/node_modules/.bin/tsx <path>` (108 checks).
- **Headless upload verification (PR #1):** `apps/pwa/scripts/verify-upload.mjs` drives the real
  built PWA against a stub API + stub S3 (happy / 401-remint / oversize / asleep-then-retry).
- **Headless screenshots (PR #2):** `apps/pwa/scripts/screenshot.mjs <dark|light> [routes…]` at
  390×844 via the bundled chrome-headless-shell. Build with `VITE_API_URL` baked when a test
  needs the API base, then restore the clean prod build.
- **Typecheck + build gate:** per service `npx tsc --noEmit`; the API bundle (`cd apps/api &&
  npm run build`, tsup) must build — it's the real resolution check across `@indigold/*` subpaths.

## The owner's phone re-test ritual (template)
1. **Quit Indigold fully** (swipe away) and reopen — **twice** if a service-worker version
   changed (the first reopen registers the new SW, the second serves it).
2. **Capture:** run the iOS Shortcut (or Inbox → Add manually) → expect the on-screen sync
   status to show the **real** result (`synced ✓` / a real HTTP error), not "(local)".
3. **Vault:** the item appears in the Universal Intake Queue; **Refresh + pull-to-refresh**
   show live data (not stale).
4. **(File upload)** attach a photo → `uploaded ✓`; open it from the capture detail; try a
   >50 MB file → blocked; airplane-mode upload → queued → re-uploads on refresh.
5. **(RADIAN, key set)** `GET /llm/status` + `/radian/status` show provider + budget; share a
   GitHub repo → playbook + NEXT ACTIONS (`GET /radian/actions`).
6. Report back the **exact** on-screen status for each — that's what promotes 🟡 → 🟢.

## What "done" requires
- Local: typecheck + build green; relevant stub/headless suite green.
- Docs: `03_CHANGELOG.md` appended; `02_CURRENT_STATE.md` updated; header stamps refreshed.
- Live: owner confirmation logged in `02_CURRENT_STATE.md` (✅) with the date.
