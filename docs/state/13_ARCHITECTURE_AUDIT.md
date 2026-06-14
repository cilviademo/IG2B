# Architecture Audit + Connector Seam Design (Phase 7)

`Last updated: 2026-06-14 · Commit: phase-7-architecture · By: claude (Claude Code)`

> The gate before any G12+ build. Findings + **recommendations** (the system is in a freeze —
> nothing here is refactored yet; this is the map for the next agent). Plus the **design** of
> the connector seam so G13 is wiring, not redesign. **Bus-factor principle throughout:** avoid
> lock-in, favor simplicity, the vault must survive with no AI / no Render / no GitHub / no
> provider / no internet.

## 1. Mirror drift (PWA `lib/*` vs `@indigold/shared`)

| Mirror | Source | Verdict |
|---|---|---|
| `lib/progression.ts` | `progression.ts` | ✅ **IN-SYNC** |
| `lib/quests.ts` | `quests.ts` | ✅ **IN-SYNC** |
| `lib/timeMachine.ts` | `time-machine.ts` | ✅ **IN-SYNC** |
| `lib/nodeState.ts` | `living-os.ts` | ⚠️ **Partial by design** |

`nodeState.ts` mirrors **only the node-state visuals** the Atlas needs; the Companion **verb
router** (`AskVerb/VERBS/verbsFor/findVerb`) lives in `living-os.ts` for the server and the PWA
gets verbs from `GET /radian/verbs/:entity` — so it's *partitioning, not a correctness bug*.
**Real (minor) drift:** the `NODE_STATE_STYLE` **labels** diverged (source has descriptive
labels "Critical — deadline/constraint", PWA has "Critical") and `glow` is optional in source.
**Recommendation:** add a tiny `mirror-sync-verify` that asserts the shared keys/values match
across both files for the partitioned subset, so drift fails CI. (Don't merge the files — the
ioredis import boundary is why they're split.)

## 2. Duplicate / redundant systems

- **Two simulation paths** — sync `POST /radian/whatif` (deterministic, instant) and async
  `simulation` job via `POST /radian/simulate` (deeper/live). Both persist a `truth_label:
  "Analysis"` node. **Intentional** (documented in code) but they should be **labelled
  distinctly** (`meta.sync: true` vs live) so `GET /radian/simulations` can tell them apart.
- **`/radian/status` vs `/radian/observability`** — not duplicates: `/status` is budget-only,
  `/observability` is the superset (Phase 5). Consider making `/status` an alias to avoid two
  budget shapes drifting. Low priority.
- No true endpoint duplication found; async/sync split is healthy.

## 3. Dead code / unused services

- **`apps/scheduler/`** — **DEAD** in the deployed profile: the embedded
  `apps/api/src/lib/scheduler.ts` (started by `RUN_SCHEDULER=true`) supersedes it. Keep ONLY
  if a split-topology is ever wanted; otherwise archive it. (Confirm it's not referenced in
  `render.yaml` before removing.)
- **`services/radian`, `services/encompass`** — **LIVE** as the embedded-vs-HTTP toggle
  (`apps/api/src/lib/services.ts`); not dead.
- **`stubTool("web_search")`** — intentional stub (becomes a real adapter when tools land).
- **`vectorstore.ts:62` TODO** — pgvector-backed store deferred; `tagEntityStore` fallback is
  active. Not blocking.

## 4. Complexity hotspots (recommend split — NOT during the freeze)

| File | Lines | Recommendation |
|---|---|---|
| `apps/api/src/routes/radian.ts` | ~970 | Split into subdomain routers: `living-os`, `quests`, `progression`, `simulation`, `admin/observability`, `llm`. Mount under `/radian`. |
| `apps/worker/src/jobs/handlers.ts` | ~770 | Extract handlers by domain (`ingest.ts`, `research.ts`, `reviews.ts`, `ask.ts`…) behind the same `JobType → Handler` map. |
| `apps/pwa/src/lib/api.ts` | ~480 | Split by feature (`questsApi`, `progressionApi`, …). |

These are **maintainability** items; they carry refactor risk against frozen, verified logic.
Do them as a dedicated, separately-verified pass — not bundled with feature work.

## 5. Tech-debt signals

- Execution agents are **proposal-only** (no external writes) — keep it that way (Constraint #11).
- G6 horizon is a deterministic planner; the live web-fetch upgrade rides the same chain.
- Reduced-motion + deterministic-floor + additive-schema invariants are well-honored; keep the
  `*-verify` suites as the regression net (now **23 suites / 405 checks**).

## 6. Connector seam — DESIGN (G13 wiring later, not redesign)

**Principle:** a connector's only job is to **produce captures**. It must NOT introduce a new
ingestion pipeline — it feeds the **existing** `capture → ingest_capture → contextualize →
graph` path, so classification, provenance, privacy gate, MVS and the Atlas all work unchanged.
This keeps lock-in low: drop a connector and the vault is unaffected.

```ts
// packages/shared/src/connectors.ts  (DESIGN — not implemented; G13 wires concrete adapters)

export type ConnectorId =
  | "gmail" | "gcal" | "github" | "gdrive" | "youtube" | "reddit"
  | "readwise" | "pocket" | "photos" | "apple_health" | "voice" | "pdf";

export interface ConnectorItem {
  external_id: string;          // stable id from the source → dedupe key (idempotent pulls)
  title: string;
  content: string;              // text body (already extracted; PDFs/voice transcribed upstream)
  url?: string;
  source: ConnectorId;          // becomes capture.source
  occurred_at?: string;         // original timestamp (email date, event start, …)
  sensitivity?: "public" | "internal" | "private" | "secret"; // default private; honors the gate
  raw?: Record<string, unknown>; // provenance — stored on capture.raw
}

export interface SourceConnector {
  id: ConnectorId;
  /** OAuth/token presence only — never returns secrets (mirrors providersStatus). */
  configured(env?: NodeJS.ProcessEnv): boolean;
  /** Pull new items since a cursor. Pure I/O; returns ConnectorItems + the next cursor.
   *  MUST be idempotent via external_id so re-runs don't duplicate (Phase 0 dedupe is the
   *  safety net, not the primary mechanism). */
  pull(opts: { since?: string; cursor?: string; limit?: number }): Promise<{ items: ConnectorItem[]; cursor?: string }>;
}

// G13 maps each ConnectorItem → POST /captures (the SAME endpoint the iOS Shortcut uses),
// then the existing worker pipeline classifies it. A weekly `connector_sync` scheduler entry
// (like horizon_scan) drives pulls; cursors persist per-connector. Secrets are Render env only.
```

**Why this seam:**
- **Reuses the capture contract** — connectors are just another capture *source*; the iOS
  Shortcut path (`/capture?raw=…`) is untouched.
- **Privacy by default** — `sensitivity` flows in and is honored by the Phase 6 gate (a
  `secret` Gmail label stays local).
- **Idempotent** — `external_id` + Phase 0 dedupe prevent re-ingest duplication.
- **No lock-in** — pulls are I/O-only adapters; nothing in the vault depends on a connector
  existing. Tools (`ToolAdapter` in `providers.ts`) remain the *research-time* seam; connectors
  are the *ingestion-time* seam — distinct, both behind interfaces.

**Insertion points (already exist):** `POST /captures` (sink), `ingest_capture` job (pipeline),
the scheduler (drive), `providersStatus()` pattern (status), the Phase-0 dedupe script (safety).

## 7. Bus-factor / survival matrix

| Loss | Vault still works? | Why |
|---|---|---|
| No AI / no provider key | ✅ | Deterministic floor for every engine; classification/quests/etc. all compute locally. |
| No internet | ✅ (PWA shell + cache) | SW caches the app shell; captures queue offline (IndexedDB) and sync later. |
| Render down | ✅ data intact | Postgres is the system of record; export bundle + additive schema allow cold restore elsewhere. |
| GitHub gone | ✅ | Repo is build/deploy only; runtime doesn't depend on GitHub. |
| Provider gone | ✅ | Governed path degrades to deterministic; no fabrication. |
| 6 months idle | ✅ | Persistent Postgres (basic-256mb) doesn't expire; scheduler catches up on next wake. |

## Gate verdict

Architecture is **sound enough to proceed** to G12 when greenlit. No blocking duplication or
lock-in. The two debts worth scheduling **before** large new surface: (a) the router/handler
file splits, and (b) the `mirror-sync-verify` guard. Connectors (G13) are a clean wiring job
against the seam above. **G14 (Life RPG)** rides existing XP/quest/decision data — no new
substrate needed.
