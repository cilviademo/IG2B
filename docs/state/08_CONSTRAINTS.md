# Constraints (the iron rules)

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

**If you read only one file beyond `00_INDEX.md`, read this one.** Violating any of these
breaks working software or the owner's trust.

## Don't break what works
1. **Never modify the iOS Shortcut link/text path.** `/capture?raw=…` (and the `url`/
   `text`/`content`/`title`/`source`/`note`/`tags`/`method`/`device` params) is a
   **byte-for-byte stable contract**. The owner's Shortcut depends on it.
2. **Never break `/share`, `/capture`, capture sync, or file upload.** These are the
   product. Both capture entry routes must keep syncing (await before navigate).
3. **The service worker NEVER caches API traffic.** App shell + fixtures only. **Any SW
   change requires a cache-version bump**, and document the quit-reopen-×2 ritual.
4. **Additive migrations only.** Append `CREATE TABLE/ALTER … IF NOT EXISTS` to BOTH
   `packages/db/src/schema.sql` and the embedded `schema.ts` string. Never a destructive
   migration; raw captures (Truth Layer A) are immutable by convention.

## Behavior rules
5. **Capture is instant; AI is asynchronous.** Capture → store → sync → queue → enrich.
   The vault never waits on a model; a failed model call never fails a capture.
6. **Surface real errors.** Show the actual HTTP status / failure reason on screen — never
   a silent fallback or a fake "synced". (This is how the owner debugs on a phone.)
7. **The owner is the live confirmation.** The sandbox cannot reach Render or R2. "Verified
   locally (headless)" is a precondition, not "done"; only the owner's device test promotes
   work to ✅ VERIFIED. Surface every failure mode as a visible status.

## RADIAN / AI rules (active once PR #3 merges; design now to honor them)
8. **All AI behind the `ModelAdapter` seam.** No direct provider calls in pipeline code.
   Provider-agnostic; Anthropic is the first-class default but never the only option.
9. **Budget governor:** ≥80% → degrade to cheap/classification-only; 100% → **queue jobs,
   do not call the model**. Pre-flight block so even the first call can't breach budget.
10. **Provenance everywhere.** Every AI-generated node/edge/action/opportunity/brief stores
    source ids, prompt version, model, timestamp, confidence. No orphan claims.
11. **AI proposes, thresholds dispose.** Auto-apply only high-confidence classification/
    tags/MVS/edges; queue opportunities/merges/plans for review. Never silently delete or
    merge. **Execution agents are proposal-only** — RADIAN never pushes code, opens PRs, or
    calls external write-APIs (executors default off).
12. **Privacy boundary:** `secret`/`internal` captures are excluded from research prompts
    and any tool-using call. Test the exclusion.

## Secrets & infra
13. **No secrets in the repo** — Render env only, names not values (see `06_SECURITY.md`).
    Never expose provider keys/tokens to the PWA or in API responses/logs/errors.
14. **Keep the low-cost single-service topology** unless asked. Don't add Render services.
15. **Synthetic demo fixtures stay gated to API-off mode** (`!apiEnabled()`); live data
    never mixes with fixtures.

## Design rules (active once the redesign PR #2 merges)
16. **AI-ism ban list:** no emoji as icons, no gradients on text/buttons, no glassmorphism,
    no heavy shadows; radius scale 0/6/10px; **mono font for DATA only** (numbers/timestamps/
    IDs), body face + sentence case for labels; one gold accent + neutral ink; left-aligned.
