# Indigold — Render Multi-Service Platform

Indigold is a local-first, AI-native **Personal Intelligence Operating System**.
This repository is the **immediate target architecture**: a monorepo deployed to
[Render](https://render.com) as eight cooperating resources.

> **v0.1 honesty:** the AI steps (summarize, tag, forecast, assemble) run as
> **deterministic, vendor-free stubs behind a clean adapter seam**
> (`apps/worker/src/lib/model.ts`, plus the Radian/Encompass services). The whole
> platform runs end-to-end with **no external AI and no API keys**; drop a model
> adapter in later without touching callers. This preserves the founding
> commitments: model-agnostic, local-ownable, privacy-first.

---

## 1. The eight Render resources

| # | Render type | Name | Role | Source |
|---|-------------|------|------|--------|
| 1 | Static Site | `indigold-pwa` | Mobile-first PWA frontend | `apps/pwa` |
| 2 | Web Service | `indigold-api` | Central backend: auth, data, import/export | `apps/api` |
| 3 | Postgres | `indigold-db` | System of record | `packages/db` |
| 4 | Key Value | `indigold-cache` | Cache, sessions, rate limits, token budget | (Redis) |
| 5 | Background Worker | `indigold-worker` | Ingestion, summarize, tag, graph, briefs | `apps/worker` |
| 6 | Cron Job | `indigold-scheduler` | Daily/weekly/monitor fan-out | `apps/scheduler` |
| 7 | Private Service | `indigold-radian` | Strategic forecasting / way-ahead | `services/radian` |
| 8 | Private Service | `indigold-encompass` | Retrieval + context assembly | `services/encompass` |

Two Blueprints are provided:

- **[`render.yaml`](./render.yaml) — low-cost (default, ~$7/mo).** One always-on
  API runs the worker, Radian, Encompass, and the scheduler **in-process**;
  Postgres + Key Value use free tiers; the PWA is a free static site. Same code,
  fewer billable instances. (Set the API to `plan: free` for ~$0 — it then sleeps
  and only processes jobs while awake.)
- **[`render.full.yaml`](./render.full.yaml) — scaled (all 8 resources).** Separate
  worker, cron, and the two private services. Deploy this later with **no code
  changes** — the API auto-detects: if `RADIAN_URL`/`ENCOMPASS_URL` are set it
  calls them over HTTP, otherwise it runs the shared intelligence core locally;
  `RUN_WORKER`/`RUN_SCHEDULER` toggle the embedded subsystems off.

Import either and Render creates the resources under one Project.

---

## 2. Repository structure

```
.
├── apps/
│   ├── pwa/          # Static Site — React 19 + Vite + Tailwind (the frontend)
│   ├── api/          # Web Service — Express API (central backend)
│   ├── worker/       # Background Worker — Redis-queue job processor
│   └── scheduler/    # Cron Job — fans out recurring jobs
├── services/
│   ├── radian/       # Private Service — forecasting / way-ahead
│   └── encompass/    # Private Service — retrieval / context assembly
├── packages/
│   ├── shared/       # Types, zod contracts, env, KV, queue (browser-safe types subpath)
│   └── db/           # Postgres schema, client, repositories, migrator
├── render.yaml       # Render Blueprint (all 8 resources)
├── tsconfig.base.json / tsconfig.json
├── .env.example
└── package.json      # root helper scripts (install:all / build:all / typecheck:all)
```

Cross-package code is shared via TypeScript path aliases (`@indigold/shared`,
`@indigold/db`) and **bundled per service** at build time (esbuild/tsup), so each
Render service builds standalone with `npm install && npm run build` in its own
`rootDir` — no workspace install gymnastics.

`indigold-app/` (standalone React prototype) and `Indigold_App/` (vanilla PWA) from
earlier phases remain for reference; `apps/pwa` is the canonical frontend now.

---

## 3. Database schema (`packages/db/src/schema.sql`)

System of record (Postgres). All rows are scoped by `user_id`; raw captures
(Truth Layer A) are immutable by convention.

- **users** — id, email, password_hash
- **captures** — raw inbox items (type, source, sensitivity, processing_status, …)
- **nodes** — knowledge graph entities (type, title, summary, truth_layer, mvs, tags)
- **edges** — temporal relationships (source/target, relationship, weight, valid_from/until)
- **timeline_events** — temporal layer
- **context_packs** — Encompass output (token budget, source_nodes, sections)
- **briefs** — Radian output (daily / weekly / forecast)
- **agents** — boardroom/agent configs
- **jobs** — job audit (queue itself lives in Redis)
- **audit_logs** — every mutation: who/what/when/why
- **api_usage** — per-user/day token, API call, and cost counters

Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`) and run on API boot
(`RUN_MIGRATIONS!=false`) or via `npm run migrate` in `apps/api`.

---

## 4. API routes (`apps/api`)

Auth is a bearer token (opaque session in Redis). All `/…` data routes require it.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` `/ready` | liveness / readiness (db + kv + queue depth) |
| POST | `/auth/register` `/auth/login` `/auth/logout` | session lifecycle |
| GET | `/auth/me` | current user |
| GET/POST | `/captures` | list / create (create enqueues `ingest_capture`) |
| POST | `/captures/:id/triage` | promote out of inbox |
| GET/POST | `/nodes`, GET/PATCH/DELETE `/nodes/:id` | graph nodes |
| GET/POST | `/edges` | graph edges |
| GET | `/timeline` | temporal events |
| GET/POST | `/context-packs`, GET `/context-packs/:id` | assemble via **Encompass** |
| GET | `/briefs`, POST `/briefs/forecast` | strategic briefs via **Radian** |
| GET | `/usage` | token-budget state (from Key Value) |
| GET | `/export`, POST `/import` | portable JSON vault round-trip |

---

## 5. Worker jobs (`apps/worker`)

Consumes a Redis-list queue (`indigold:jobs`). Handlers:

- `ingest_capture` → normalize a capture into a node, then enqueue summarize/tag/graph
- `summarize` → model-adapter summary; promotes node to Truth Layer C
- `tag` → keyword tags + MVS bump
- `graph_update` → auto-link nodes that share tags
- `daily_brief` / `weekly_review` → call Radian, store a brief
- `monitor_scan` / `research` → audited placeholders for the monitoring/research engines

Swap `model.ts` for a real model adapter to make summarize/tag intelligent.

## 6. Cron schedule (`apps/scheduler`)

One daily Render Cron (`0 13 * * *`, 13:00 UTC) fans out per user:
`daily_brief` every run, `monitor_scan` daily, `weekly_review` on Mondays.
Override a single cadence with `SCHEDULER_TASK=daily|weekly|monitor`.

---

## 7. Environment variables

See [`.env.example`](./.env.example). Highlights (production values come from
`render.yaml`):

| Var | Used by | Source on Render |
|-----|---------|------------------|
| `DATABASE_URL` | api, worker, scheduler | `indigold-db` connectionString |
| `REDIS_URL` | api, worker, scheduler | `indigold-cache` connectionString |
| `SESSION_SECRET` | api | generated |
| `INTERNAL_TOKEN` | api, worker, radian, encompass | shared env group (generated) |
| `RADIAN_URL` / `ENCOMPASS_URL` | api, worker | private-service `hostport` |
| `PWA_ORIGIN` | api (CORS) | `indigold-pwa` host |
| `VITE_API_URL` | pwa (build) | `indigold-api` host |
| `DAILY_TOKEN_BUDGET` | api | shared env group |

---

## 8. Security boundaries

- **Public surface:** only `indigold-pwa` (static) and `indigold-api` (web).
- **Private services:** `radian` + `encompass` are `pserv` — no public ingress;
  reachable only inside the Render network, and additionally gated by a shared
  `INTERNAL_TOKEN` (`x-internal` header).
- **Data store / cache:** `indigold-db` and `indigold-cache` accept internal
  connections only (`ipAllowList: []`).
- **AuthN/Z:** scrypt password hashing; opaque bearer sessions in Redis; every
  data route is `user_id`-scoped (no cross-tenant reads).
- **Rate limiting + token budget:** fixed-window limits and per-user/day usage
  counters in Key Value; CORS restricted to `PWA_ORIGIN`.
- **Auditability:** `audit_logs` records register/login/import/export and worker
  actions. **No secrets in the repo;** all secrets are generated by Render.
- **No external AI / network calls** in v0.1 — the model seam is local.

---

## 9. Local development

Prereqs: Node 20+, a local Postgres and Redis (e.g.
`docker run -p 5432:5432 -e POSTGRES_DB=indigold -e POSTGRES_HOST_AUTH_METHOD=trust postgres`
and `docker run -p 6379:6379 redis`).

```sh
cp .env.example .env            # export the vars (direnv/dotenv), or set per shell
npm run install:all             # install every service

# migrate the database
cd apps/api && npm run migrate && cd ../..

# run the stack (separate terminals, or a process manager)
cd services/radian    && npm run dev    # :7101
cd services/encompass && npm run dev    # :7102
cd apps/api           && npm run dev    # :7000
cd apps/worker        && npm run dev    # consumes the queue
cd apps/pwa           && npm run dev    # :3000  (set VITE_API_URL=http://localhost:7000)

# trigger recurring jobs once:
cd apps/scheduler && npm run dev
```

The PWA runs **standalone on bundled fixtures** when `VITE_API_URL` is empty, so
you can review the UI without the backend.

---

## 10. Production deployment (Render)

**Blueprint (recommended):**
1. Push this repo to GitHub (`main`).
2. Render Dashboard → **New → Blueprint** → pick this repo. It reads `render.yaml`
   and proposes all 8 resources under a Project named **Indigold**.
3. Confirm plans/regions, then **Apply**. Render provisions Postgres + Key Value,
   builds each service from its `rootDir`, injects env vars, and links the private
   services. The API runs migrations on first boot.

**Manual (matches the dashboard you started):**

| Service | Root Directory | Build | Start / Publish |
|---------|----------------|-------|-----------------|
| indigold-pwa | `apps/pwa` | `npm install && npm run build` | Publish: `dist` |
| indigold-api | `apps/api` | `npm install && npm run build` | Start: `npm start` |
| indigold-worker | `apps/worker` | `npm install && npm run build` | Start: `npm start` |
| indigold-radian | `services/radian` | `npm install && npm run build` | Start: `npm start` |
| indigold-encompass | `services/encompass` | `npm install && npm run build` | Start: `npm start` |
| indigold-scheduler | `apps/scheduler` | `npm install && npm run build` | Start: `npm start` (Cron) |

Then create `indigold-db` (Postgres) and `indigold-cache` (Key Value), and set the
env vars per §7. Health check path for the API is `/health`.

> If you only deployed the plain prototype before, the alternate static settings
> (blank root / publish `.`) no longer apply — the canonical frontend is the
> modern app at `apps/pwa`.
