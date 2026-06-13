# RADIAN 2.0 — Wave 0 (Foundation)

Branch `claude/radian-2.0` off `main`. Additive only; nothing in capture sync,
the iOS Shortcut, `/share`, `/capture`, file upload, or existing UI changed.

## Phase 0 audit (code is truth)

| Concern | Finding |
| :-- | :-- |
| **AI seam** | Existed in two places: `apps/worker/src/lib/model.ts` (`ModelAdapter` w/ `summarize`/`tags`, deterministic impl) and `packages/shared/src/intelligence.ts` (pure forecast/retrieve/assemble). Both deterministic, no keys. Wave 0 adds the richer provider-agnostic seam in `packages/shared/src/model.ts`; the worker's old seam still runs unchanged (Wave 1 migrates handlers onto the new one). |
| **Schema** | `packages/db/src/schema.ts` exports `SCHEMA_SQL` (a string literal) — the **runtime** DDL applied by `migrate()` on boot. `schema.sql` is the human-readable mirror. Additive migration = append `CREATE TABLE IF NOT EXISTS` to **both**. |
| **Job queue** | Redis lists (`enqueue`/`consume`/`queueDepth` in `packages/shared/src/queue.ts`), mirrored by a `jobs` table. In-process worker + scheduler (`RUN_WORKER`/`RUN_SCHEDULER`). Handlers in `apps/worker/src/jobs/handlers.ts`. Boot catch-up exists conceptually (processing_status). |
| **Cost** | `api_usage` table = per-day rollup only. No per-call ledger. Wave 0 adds `ai_calls`. |
| **pgvector** | **Not** in use; `nodes` has no embedding column. **Feasibility must be live-verified** by the owner (`CREATE EXTENSION vector` on the basic-256mb instance). Until then, Stage 2 retrieval uses entity/tag match (the existing `retrieve()` already does this). The `ModelAdapter.embed` seam + a deterministic hash-embed exist so the embedding path can switch on without pipeline changes. |
| **Capture types** | Old enum present. RADIAN's new types (Idea/Task/Person/Project/Reference/Learning/Asset/Opportunity) migrate **additively** in Wave 1 (type is `TEXT`, so no enum migration needed — Stage 1 just writes the new values). |

## What Wave 0 shipped

- **`ModelAdapter` seam** (`packages/shared/src/model.ts`) — provider-agnostic
  `complete` + `embed`. **Anthropic** implementation (fetch-based, no SDK dep, key
  from env only) + **deterministic** implementation (sandbox/offline). `getModel(tier)`
  factory picks the real adapter when `ANTHROPIC_API_KEY` is set, else deterministic.
  Adding OpenAI/Gemini/Ollama = one new function, zero pipeline edits.
- **Two tiers, config-driven** — `cheap` (Haiku-class) / `strong` (Sonnet-class).
  Model strings, per-Mtok pricing, max tokens, and the monthly budget all come from
  env (`RADIAN_MODEL_CHEAP`, `RADIAN_MODEL_STRONG`, `RADIAN_MONTHLY_BUDGET_CENTS`, …),
  hot-swappable without code changes.
- **Cost ledger** — `ai_calls` table + `aiCalls.log/monthCostCents/monthByPurpose`.
  Every governed call logs purpose, provider, model, tier, tokens, cost, source id,
  prompt version, status.
- **Budget governor** — pure `governorDecision` (≥80% → degrade to cheap-only; ≥100%
  → block) **plus** a pre-flight estimate so even the first call is blocked when it
  would breach budget. Blocked calls are logged (visible) and throw
  `BudgetExceededError` so callers **queue** the work — never fake success.
- **Governed orchestrator** (`packages/db/src/ai.ts`) — `governedComplete()` is the
  single path every AI call takes: governor check → adapter → ledger + usage log.
  `budgetStatus()` powers `GET /radian/status`.
- **Prompt registry** (`packages/shared/src/prompts.ts`) — versioned prompts; every
  output stores the version (provenance). `prompt_overrides` table lets Meta-Radian
  (Wave 4) bump a version at runtime; a human approves.
- **`ToolAdapter` seam** — interface + `web_search`/`github` stubs (real ones land in
  Wave 2). arXiv/YouTube/Gmail/Notion are future adapters behind the same interface.
- **Project Registry** — `projects` table + `GET/POST/PATCH /projects` (auth'd),
  seeded with the owner's 8 domains on first use; editable at runtime, no redeploy.
- **Privacy boundary** — `isResearchSafe`/`filterResearchSafe` + `services/radian/PRIVACY.md`.
- **Stub test** — `packages/shared/scripts/wave0-verify.ts` (26 checks, all green),
  incl. the `$0.01 → no calls` budget force-test.

## What runs when (after Wave 0)

Nothing new runs automatically yet — Wave 0 is plumbing. The pipeline stages
(ingest → contextualize → assist → research → briefs …) get wired to
`governedComplete` in Waves 1–4. `GET /radian/status` and `/projects` are live now.

## Projected monthly cost

Driven by `RADIAN_MONTHLY_BUDGET_CENTS` (default **$15/mo**). At typical capture
volume, Stage 1–2 (cheap tier) dominate call count; strong-tier calls (briefs,
research, opportunities, simulation) are batched/scheduled and rate-capped. The
governor degrades to cheap-only at 80% and queues at 100%, so spend is bounded by
config regardless of volume. Real numbers land once the owner live-tests with a key
(the ledger reports actual cost per purpose via `/radian/status`).

## Roadmap & gates

- **Wave 0 (this):** foundation. *Gate: stub-tested ✓ (26/26).* Owner live-checks:
  `GET /projects` seeds 8 domains; `GET /radian/status` shows provider + budget state.
- **Wave 1:** Stages 1–2 (ingest + contextualization + edges + project-relevance).
  *Gate: 3 links + 1 secret note → classification/links/relevance verified on phone;
  secret-exclusion test green.*
- **Wave 2:** Stages 3–5 (assistance, research w/ web-search + GitHub adapter, briefs/packs).
- **Wave 3:** Stages 7–9 (opportunities, decision journal, consolidation).
- **Wave 4:** Stages 6 (proposal-only agents), 10 (simulation), 11 (Meta memo).

## New env (Render only)

```
ANTHROPIC_API_KEY=...            # absent => deterministic everywhere (sandbox-safe)
RADIAN_MONTHLY_BUDGET_CENTS=1500 # $15/mo
RADIAN_MODEL_CHEAP=claude-haiku-4-5-20251001
RADIAN_MODEL_STRONG=claude-sonnet-4-6
# pricing (cents/Mtok) + max tokens are overridable: RADIAN_CHEAP_IN_CENTS, …
```
