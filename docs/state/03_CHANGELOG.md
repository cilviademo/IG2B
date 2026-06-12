# Changelog

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

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
