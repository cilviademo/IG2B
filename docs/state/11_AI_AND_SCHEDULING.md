# AI Provider Path + Scheduling — audit & QA

`Last updated: 2026-06-14 · Commit: phase-2-provider · By: claude (Claude Code)`

> Phase 2 of the hardening directive. **Order is load-bearing: always-on BEFORE provider.**
> This documents what silently doesn't fire on the free tier, audits the governed AI path
> (the trust core), and gives the owner the live-QA checklist for wiring providers.

---

## 2.1 — Starter-tier delta: what is *silently not firing* on free tier

The scheduler is **in-process** (`apps/api/src/lib/scheduler.ts`), not a separate Render
Cron. It works by `setInterval(tick, 30min)` + a once-per-day Redis guard, firing the
fan-out at/after `SCHEDULER_HOUR` (default **13:00 UTC**).

**The problem:** on Render **free tier the API sleeps after ~15 min idle**, and a sleeping
dyno's timers don't run. So the daily/weekly/monthly fan-out only happens if the API
*happens to be awake* during a 30-min tick window at ≥13:00 UTC. In practice, unless you're
actively using the app at that time, **these never fire**:

| Schedule | Jobs (scheduler.ts) | Free-tier reality |
|---|---|---|
| **Daily** (≥13:00 UTC) | `daily_brief`, `monitor_scan`, `consolidate` | ❌ Usually skipped — dyno asleep at 13:00 |
| **Weekly** (Mon) | `weekly_review`, `opportunity_scan`, `export_bundle`, **`horizon_scan`** (G6) | ❌ Even less likely to land |
| **Monthly** (1st) | `calibration`, `monthly_review` | ❌ |
| **Quarterly / Annual** | `quarterly_review`, `annual_review` | ❌ |

**Why this matters for QA order:** a *manual* call (e.g. `POST /radian/horizon-scan`) works
in `live` mode and would make you conclude "the background path works" — but the *scheduled*
path is the thing that's broken on free tier. **Do not** sign off background AI on a manual
call alone.

**Fix is the owner's toggle (not code):** set `indigold-api` to **`starter` (~$7/mo)** in the
Render dashboard so the dyno stays awake; the existing scheduler then fires reliably. After
toggling, confirm with: `GET /radian/status` and check the next-day `briefs` / `horizon`
appear without a manual trigger. (No code change needed — `render.yaml` already documents the
`free`→`starter` note at the `plan:` line; flipping the dashboard value is enough.)

**Prerequisite ordering:** turn on always-on (starter) **before** wiring a live provider, so
the first real token spend is on a vault that's (a) deduped (Phase 0) and (b) actually able
to run its scheduled briefs.

---

## 2.2 — Governed AI path audit (the trust core)

Path: `repo.governedComplete` (`packages/db/src/ai.ts`) → budget governor → provider adapter
(`packages/shared/src/{model,providers}.ts`) → cost ledger (`ai_calls`). Findings, with refs:

### (a) No provider key can reach the PWA or the logs — ✅
- Keys are read from `process.env` only inside the adapters (`model.ts:35,163`,
  `providers.ts:79,122,157,162`); never returned.
- The ledger logs the **provider name**, never the key (`ai.ts:66,83`).
- `GET /llm/status` returns presence (`configured: true/false`) + mode + budget only — comment
  at `radian.ts:875` and `providersStatus()` (`providers.ts:284`) confirm token values are
  never read/returned.
- `POST /llm/provider-config` **ignores** any `key`/`token` in the body and only tells the
  operator which env var to set (`radian.ts:892`).
- No `console.*` anywhere prints a key/token (grep across model/providers/handlers = none).

### (b) `BudgetExceededError` reliably queues, never fabricates, on every caller — ✅
- `governedComplete` does a **pre-flight** estimate so even the *first* call is blocked when it
  would breach budget (`ai.ts:56-70`), logs the refusal as a zero-spend ledger row (visible,
  not silent), then throws.
- **Every** worker caller catches it and finishes the job `queued` with reason `budget_governor`
  (handlers.ts lines 47/108/190/298/384/455/518/572/604/638/690). The ingest path also resets
  the capture to `unprocessed` so the next pass retries (handlers.ts:50). No fake success path.

### (c) Deterministic floor is the fallback on **mid-flight** failure, not only when no key — ✅
- Two layers: (1) parse-or-floor — `parseX(r.text) ?? deterministicX(...)` (e.g.
  handlers.ts:45,106) handles a live provider returning unparseable output; (2) catch-or-floor —
  the non-budget `catch` branch assigns the **deterministic result** (handlers.ts:54,112,194,…)
  so a network/provider 500 yields honest, grounded content and the **job still finishes**
  (`done`), never hangs and never fabricates.
- `getModel`/`getTaskAdapter` return the deterministic adapter when no key is present
  (`model.ts:195-198`, `providers.ts:223-228`), so the floor is the baseline in stub mode too.

**Conclusion:** the trust core holds as written. No code changes were required for 2.2 —
the audit is the deliverable. (Re-confirm (c) live once a key is set by forcing a provider
error, per 2.3.)

---

## 2.3 — Provider wiring + live QA (owner-run; sandbox has no keys)

Providers supported (`providers.ts`): `anthropic`, `openai`, `openrouter`, `gemini`, `ollama`
(+ `deterministic` floor). Env var per provider is in `PROVIDER_ENV`; task→model routing in
`resolveTask`. Mode is inferred `live` when any key is present (`llmMode`).

**Checklist (do after the starter toggle):**
1. Set a key in Render → Environment (e.g. `ANTHROPIC_API_KEY`), redeploy.
2. `GET /llm/status` → `mode: "live"`, the provider `configured: true`.
3. Exercise each verb and confirm **model text** lands (with the deterministic result as the
   floor if the call fails): `ask` / `research` / `boardroom` / `mentor` / `whatif`.
4. **Close the G1 gate live** (phone gate #4): "Research this" → a `derived_from` child node
   appears on the subject and the job **finishes** (not stuck `queued`).
5. **Force a mid-flight failure** (e.g. a bad key value or a model id that 500s) and confirm
   the child node still lands with deterministic content + the job finishes — proving 2.2(c)
   live.
6. Watch budget: do a few calls, then check **spend-by-purpose** (below).

---

## 2.4 — On-device budget visibility — ✅ (shipped)

`GET /llm/status` now returns `budget.by_purpose` (`[{purpose, cents, calls}]`, highest-first
— purpose + cents + count only, never prompt content). The PWA **I/O page** ("Intelligence
(Radian)" section) shows: provider configured-state, mode, **month-to-date / monthly budget**,
the governor state, a gold warning when the governor isn't `ok` (degraded/queued, *not*
silently spending), and the **spend-by-purpose** breakdown. A live key therefore cannot drain
budget unseen — every cent is attributable on the phone.

Files: `apps/api/src/routes/radian.ts` (`/llm/status`), `apps/pwa/src/lib/api.ts`
(`LlmStatus`), `apps/pwa/src/pages/ImportExport.tsx` (render).
