# One Vault Reality — Safari ↔ installed-PWA convergence

`Last updated: 2026-06-14 · Commit: durable-account · By: claude (Claude Code)`

> Device-QA found the installed home-screen PWA and the Safari URL showing
> **different** vault state (Safari had the new Apple-Note node + Atlas edge; the
> PWA did not). This documents the real root cause and the fix.

## Root cause — two anonymous accounts, NOT stale cache

The PWA shows no login. `ensureSession()` (`apps/pwa/src/lib/api.ts`) silently mints
a **random** device account (`device-<rand>@indigold.local`) and stores it in
`localStorage` under `indigold_device`. Every server read (`fetchCaptures`,
`getLiveNodes`, `getLiveEdges`) is scoped to that account.

On iOS, an **installed home-screen PWA has a separate storage partition from
Safari.** So each surface mints its *own* random account → **two different users on
the server → two different vaults.** The Shortcut opens its capture link in Safari
(the default browser), so captures land under Safari's account; the installed PWA,
on a different partition, minted a fresh empty account. No amount of cache-busting
or Force-Sync converges them — the data is partitioned by account.

(The SW-caching and sync-on-launch gaps the owner suspected were also real and are
fixed below, but they are *not* why the two surfaces diverged.)

## Durable fix — real login (after pairing proved fragile)

Device-QA round 2 showed pairing **didn't persist**: a PWA reinstall (and iOS
storage eviction) wiped the anonymous device account, so the surface minted a fresh
empty one and the earlier note looked "lost" (it's orphaned on the server under the
discarded account, not deleted). A code you copy between devices can't survive a
storage wipe — so the owner chose a **real, recoverable login**.

- **Backend:** `POST /auth/claim` (authed) + `users.claim(userId,email,password_hash)`
  — sets a real email+password ON THE SAME user id, so the current vault's data is
  preserved and becomes recoverable. `POST /auth/login` already existed.
- **Frontend:** Settings → **Account** (`AccountPanel`): *Secure this vault* (claim,
  keeps current data) and *Log in* (restore on any surface / after reinstall). Real
  `<form>` with `autocomplete="username"` / `new-password` / `current-password`, so
  **iCloud Keychain** offers to save it and autofills/syncs it across Safari + the
  installed PWA — the two surfaces converge with no codes. Creds are persisted so the
  silent session re-auths to the same account; `logout` clears them.
- **Recovery:** after any wipe/reinstall, just log in with the email+password →
  same vault, every time. Pairing code stays as an optional shortcut.

## Real export (data-safety fix)

The Settings **Export** button used to dump only the demo fixtures (so the earlier
"backup" wasn't real). It now exports the **actual vault** — server captures + nodes
+ edges + the local capture cache — as `indigold_vault_<date>.json`.

## Library / Repository (`/library`)

A storage view of the vault — uploaded **Files**, **Completed** (processed) and
**Archived** captures — bucketed with counts, reading the same server vault as Atlas
(so they always agree). Open files via signed URL; restore archived items. Lives in
the **More** hub.

## The fix — pairing code (owner-chosen, now secondary)

Settings → **Vault sync & devices**:
- Shows this surface's **mode** (installed PWA vs browser tab) and **device account
  email** — if the two surfaces show different emails, they're different vaults.
- **Copy pairing code** — encodes this surface's device account as `IG1.<base64url>`.
- **Link a device (paste a pairing code)** — the other surface adopts that account
  (replaces its creds, drops its token, re-auths, pulls the vault). Both surfaces now
  read the **same** server vault.

The pairing code IS the vault credential — treat it like a password. It only leaves
the device when the owner deliberately copies it across their own surfaces.

## Persistence & automatic sync (owner follow-up)

You paste a pairing code **once**. It's stored in `localStorage` (`indigold_device`)
and a `indigold_paired_at` flag marks the surface as **linked** — it stays on that
vault across relaunches until you **Unlink**. Settings shows a *linked* badge so you
can trust it persisted.

The vault then refreshes itself with **no taps**:
- **On launch** and **on foreground** (`startAutoSync` in `App.tsx`).
- At **designated UTC times** — `SYNC_SLOTS_UTC = [0, 6, 12, 18]` (00/06/12/18 UTC).
- iOS PWAs can't run reliably while fully closed, so a slot that elapses while the
  app is shut **catches up on next open** (compares `lastSync` to the most recent
  elapsed slot). On Android/desktop we also register native **Periodic Background
  Sync** best-effort (iOS ignores it — foreground catch-up covers it).
- `forceSync` is **two-way**: it pushes any unsynced local captures UP first (so an
  offline capture is intaken even if you never open Inbox), then pulls the vault DOWN.
- The panel shows the schedule + the next scheduled time; an **Unlink this device**
  control forgets the account (next launch mints a fresh one).

## Supporting reliability work (all surfaces)

- **Force Sync** (Settings) + **sync-on-launch** (`App.tsx`): pull the authoritative
  server vault; server wins for synced objects. Inbox + Atlas re-pull on the
  `indigold:vault-synced` event so they converge immediately.
- **Stale banner**: if the API is configured but the last sync failed (or never ran),
  a banner says *"Vault may be stale — tap to Force Sync."* We never show stale data
  silently.
- **Update banner + version display**: the SW reports its cache version over a
  message channel; the build commit/time are injected at build (`vite.config.ts`).
  A "New version available — Reload" banner appears when a new SW takes control, so
  the installed PWA never silently runs stale code.
- **SW re-audit (cache `v0.24.0`)**: confirmed NO API path is cached — `captures,
  auth, capture/upload, nodes, edges, timeline, briefs, context-packs, radian/*,
  assets, usage, llm, events, projects`, plus all cross-origin `*.onrender.com` API
  hosts. Only static (Vite-hashed) assets cache. `/activity` is a client route whose
  data uses the bypassed `/radian/*`.

## Debug / Sync Status panel (Settings)

Shows: mode (standalone vs browser), **device account email**, origin, route, build
commit, build time, SW version, API URL, API health, auth-token presence, last sync,
local capture count, server capture/node/edge counts, storage namespace.

## Verification scenarios (owner runs A/B/C on device)

| # | Scenario | Status |
|---|---|---|
| A | Safari URL: Apple Note in Inbox + node + edge on Atlas | owner-confirmed working (this is account A's vault) |
| B | Installed PWA: same capture/node/edge | **after pairing** — copy code in Safari → paste in PWA → both match |
| C | Force Sync: capture in Safari, open PWA, tap Force Sync → PWA matches | wired (sync-on-launch + Force Sync re-pull) — owner confirms on device |
| D | SW: no API cached, static assets cache, update banner on new build | SW audited (v0.24.0); update/version path verified headless (banner renders) |

**Headless limits:** the static screenshot build has no `VITE_API_URL`, so the panel
shows "standalone — no API" and no device email there; on the real Render deploy the
API URL, health, device email, and counts populate. iOS storage-partition behaviour
can only be confirmed on the actual phone.

## Owner steps to converge today

1. Update both surfaces to this build (PWA: the Reload banner, or quit-reopen ×2).
2. Open **Settings → Vault sync & devices** in **Safari** → **Copy pairing code**.
3. Open the **installed PWA** → Settings → **Link a device** → paste → **Use pairing
   code**.
4. Both should now show the **same device account** and the same Inbox/Atlas. Confirm
   scenarios B and C.
