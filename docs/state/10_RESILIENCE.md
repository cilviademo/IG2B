# Resilience & No Lock-in

`Last updated: 2026-06-13 · Commit: integration · By: claude (Claude Code)`

Indigold must survive provider/host/repo failure, long inactivity, provider migration,
and the owner's absence. The standing rule: **capture never depends on AI availability**,
and **the vault is reconstructable from one export bundle + the R2 objects.**

## Failure modes & runbooks

### AI provider failure
- All AI is behind `ModelAdapter`; with no key the deterministic adapter runs everything.
- Pipeline degrades to "enrichment paused" — captures still store, sync, and queue; a
  failed/blocked model call **queues** (governor) or falls back to deterministic. **Capture
  never breaks.** (Test: unset all `*_API_KEY` → `LLM_MODE=stub` → capture + upload still work.)

### Render failure / restore
- **Postgres:** enable Render's daily backups on `indigold-db`. Restore = provision a new
  Postgres, point `DATABASE_URL` at it, boot the API (migrations are idempotent on boot).
- **R2 is external** (Cloudflare) — file bytes survive a Render outage independently.
- **Key Value (Redis):** holds NO business truth (sessions/locks/counters only); it warms
  from Postgres on boot. Eviction is expected (see BUG-003).

### GitHub failure
- Mirror the repo: `git remote add mirror <url> && git push --mirror mirror`. The repo is
  self-describing via `docs/state/` — any agent can stand it up elsewhere.

### Six months of inactivity (boot catch-up)
- Jobs are idempotent; the scheduler guards on `scheduler:lastrun` and resumes cleanly.
- Boot catch-up reprocesses anything `UNPROCESSED`.
- Budget resets monthly (the governor sums month-to-date from the ledger).
- A **"welcome back" brief** summarizes the gap from the event store (the daily brief reads
  recent events; longer gaps surface in the monthly/quarterly review).

### Provider migration
- Set `LLM_*_PROVIDER` env vars; no code change (see `docs/CONNECT_AN_LLM_PROVIDER.md`).

### Human absence / no lock-in
- **Weekly `export_bundle` job** + `GET /radian/export-bundle`: a full JSON dump of
  projects/captures/nodes/edges/**events**/briefs/decisions/opportunities/constraints +
  asset metadata. The vault reconstructs from **one bundle + the R2 objects**.
- No subscription-dependent truth. `docs/state/` explains how to stand the system up elsewhere.

## Acceptance tests (Wave D gate)
- **Export → scratch restore:** `GET /radian/export-bundle` → save JSON → load into a scratch
  Postgres → counts match. (The bundle carries every table needed to rebuild current state +
  the event history to replay it.)
- **Kill-switch:** with no API key (`LLM_MODE=stub`), capture + upload + sync remain fully
  functional; enrichment runs deterministically. Proven by `providers-verify` (live refuses
  without key, stub is deterministic) + the capture/upload paths' no-AI dependency.
- **Sentinel budget block:** a forced `$0.01` budget blocks an over-budget call (governor
  pre-flight) — proven by `wave0-verify`.

## Agent attribution (D1)
Every model call + event carries its agent `actor` (`agent:Atlas`, `agent:Radian`,
`agent:Chronos`, `agent:Archivist`, `agent:Sentinel`, …). The role→responsibility map is in
`docs/state/04_DECISIONS.md` (ADR-013) and `packages/shared/src/cognition-d.ts` (`AGENT_ROLES`).
