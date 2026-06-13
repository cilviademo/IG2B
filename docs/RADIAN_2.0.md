# RADIAN 2.0 — complete pipeline (Waves 0–4)

Branch `claude/radian-2.0` off `main`. Additive only — capture sync, iOS Shortcut,
`/share`, `/capture`, file upload, and existing UI are untouched. Every AI call goes
through the governed model+provider seam (budget → adapter → ledger), runs
deterministically with no key (stub), and switches to real providers when a key is set.

## Stages & what runs when

| Stage | Trigger | Tier | Output |
| :-- | :-- | :-- | :-- |
| 1 Intelligent ingest | on capture | cheap | type/summary/entities/MVS/actionability → node |
| 2 Contextualization | after 1 | cheap | typed edges + project_relevance; timeline insight |
| 3 Assistance | after 2 if actionability ≥ MEDIUM | strong | playbook + NEXT ACTIONS (child node) |
| 4 Research | manual `POST /radian/research/:nodeId` + Stage-3 source-trace | strong | findings → new captures (re-enter 1–2) |
| 5 Briefs | scheduler (daily/weekly) | strong | registry-aware daily brief + due decisions |
| 7 Opportunities | scheduler (weekly) / `POST /radian/opportunities/scan` | strong | Opportunity proposals → review queue |
| 8 Decision journal | `POST /radian/decisions` + scheduler monthly calibration | cheap | decisions + calibration (over/under-confidence) |
| 9 Consolidation | scheduler (nightly) | cheap | MVS strengthen/decay (floored) + theme nodes |
| 6 Agents (proposal-only) | `POST /radian/agent-tasks` | strong | DRAFT artifact node (never executes) |
| 10 Simulation | `POST /radian/simulate` | strong | 2–4 path estimate → Analysis node |
| 11 Meta-Radian | `POST /radian/meta-review` / monthly | strong | System Improvement Memo (capture) w/ prompt-diff recs |

Scheduler fan-out (in-process, daily ~13:00 UTC): `daily_brief`, `monitor_scan`,
`consolidate`; Mondays also `weekly_review` + `opportunity_scan`; 1st of month also
`calibration`. Each AI call is governed: at ≥80% budget it degrades to cheap-only, at
100% it **queues** (no spend); a model/tool error falls back to the deterministic
implementation, so a capture is never lost or faked.

## API surface (all Bearer-auth)

- `GET/POST/PATCH /projects` · `GET /radian/status` · `GET /llm/status` · `POST /llm/provider-config`
- `POST /radian/research/:nodeId` · `GET /radian/actions`
- `GET/POST /radian/opportunities` · `POST /radian/opportunities/scan` · `PATCH /radian/opportunities/:id`
- `GET/POST /radian/decisions` · `GET /radian/decisions/due` · `POST /radian/decisions/:id/outcome` · `GET /radian/calibration`
- `POST/GET /radian/agent-tasks` · `POST /radian/simulate` · `GET /radian/simulations` · `POST /radian/meta-review` · `GET /radian/meta`

## Provider framework

Anthropic / OpenAI / Gemini / OpenRouter / Ollama behind one `ModelAdapter`; per-task
routing (`LLM_*_PROVIDER`), `LLM_MODE` (stub/live/replay), GitHub `ToolAdapter`. Keys
only from env, never logged/returned/exposed. See `docs/CONNECT_AN_LLM_PROVIDER.md`.

## Privacy

`secret`/`internal` captures are filtered (`filterResearchSafe`) before any research
or tool call; `POST /radian/research/:nodeId` 403s on a secret/internal source. See
`services/radian/PRIVACY.md`.

## Projected monthly cost

Config-bounded by `RADIAN_MONTHLY_BUDGET_CENTS` (default **$15/mo**). Cheap-tier
Stages 1–2 dominate call count; strong-tier (3/5/7/10/11) are gated/scheduled/manual
and rate-aware. The governor degrades then queues, so spend can't exceed budget
regardless of volume. Real per-purpose cost is in `GET /radian/status` once a key is set.

## Tests

108 stub checks across `packages/shared/scripts/{wave0,providers,wave1,wave2,wave3,wave4}-verify.ts`
(26+17+18+16+13+18), all green. Worker + API typecheck clean; API bundle builds. No
live model calls in tests.

## Per-wave live gates (add a provider key first; everything else works stubbed)

- **W0:** `GET /projects` seeds 8 domains; `/radian/status` + `/llm/status` show provider/budget.
- **W1:** share 3 links + 1 secret note → new-type classification + entities/MVS/actionability, typed edges + project-relevance; secret stays out of research.
- **W2:** share a GitHub repo → playbook + NEXT ACTIONS (`GET /radian/actions`); `POST /radian/research/:nodeId` → inspectable finding captures; daily brief reads true.
- **W3:** `POST /radian/opportunities/scan` → review-queue proposals; log a decision, record outcome → `GET /radian/calibration`; nightly consolidation adjusts MVS + themes.
- **W4:** `POST /radian/agent-tasks` (draft only) · `POST /radian/simulate` (multi-path estimate) · `POST /radian/meta-review` → memo with prompt-diff recommendations.
