# Overview

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

## What Indigold is
A **local-first, AI-native Personal Intelligence Operating System** for one owner.
The capture flow is deliberately frictionless: **iPhone → Apple Shortcut / share sheet →
PWA → auto-classify → store → vault.** Capture is instant; any AI enrichment is
asynchronous and never blocks (or fails) a capture.

Operating metaphor (RADIAN, the intelligence layer): **Chief of Staff + Research
Analyst + Systems Thinker + Compound Intelligence Partner** — for every input it should
eventually answer *what is this, why does it matter, where does it connect, what should
I do, what's next, what am I missing.*

## Monorepo architecture

```
apps/
  pwa/        React 19 + Vite + Tailwind 4 + Wouter + Sonner — the mobile-first frontend (PWA)
  api/        Express API — auth, captures, nodes/edges, context-packs, briefs, upload, projects, llm/radian
  worker/     Redis-queue job processor (ingest → enrich → graph → briefs)
  scheduler/  Cron fan-out (daily/weekly/monitor; + RADIAN consolidate/opportunity/calibration)
  ios-shell/  Capacitor shell (reference; not the primary path)
services/
  radian/     Strategic forecasting / way-ahead (private)
  encompass/  Retrieval + context assembly (private)
packages/
  shared/     Types, zod contracts, env, KV, Redis queue, intelligence core, (RADIAN: model/providers/prompts/registry/stages)
  db/         Postgres schema (embedded SQL), client, repositories, migrator, (RADIAN: governed AI orchestrator)
indigold-app/   Standalone React prototype (earlier phase, reference only)
Indigold_App/   Vanilla PWA prototype (earlier phase, reference only)
indigold-local.html  Self-contained single-file build (reference)
```

Cross-package code uses TS path aliases (`@indigold/shared`, `@indigold/db`) and is
**bundled per service** (esbuild/tsup) so each Render service builds standalone.

## Deploy topology (Render)

Two Blueprint profiles:

- **`render.yaml` — low-cost (default, ≈$6/mo).** Four resources:
  - `indigold-pwa` (Static Site)
  - `indigold-api` (Web Service) — runs **worker + scheduler + radian + encompass IN-PROCESS** (`RUN_WORKER=true`, `RUN_SCHEDULER=true`; no `RADIAN_URL`/`ENCOMPASS_URL` → shared core runs locally)
  - `indigold-db` (Postgres, basic-256mb, persistent)
  - `indigold-cache` (Key Value / Redis, free)
- **`render.full.yaml` — scaled (8 resources).** Separate worker, cron, and the two
  private services. Switch with **no code changes** — the API auto-detects HTTP vs
  embedded via env.

**R2 (Cloudflare):** private object storage via the S3-compatible AWS SDK v3 adapter.
Bucket is private-only; files are served via **time-limited signed URLs**. Configured by
`STORAGE_*` env vars (values in Render only).

**Keep-alive:** `.github/workflows/keepalive.yml` pings the free API so it's warm for
captures (free tier sleeps after ~15 min idle).

## Cost posture
Bounded by config. The low-cost profile is ~$6/mo. RADIAN adds a budget governor
(`RADIAN_MONTHLY_BUDGET_CENTS`, default $15/mo) that degrades then queues, so model
spend can't run away regardless of capture volume. No external AI keys are required to
run the whole platform (deterministic stubs); keys are added later via Render env.
