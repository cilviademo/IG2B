# Cognition Wave A — docs/state deltas (merge into canonical docs)

`Last updated: 2026-06-12 · Commit: 603527b(main) · By: claude (Claude Code)`

> **Merge order:** this branch (`claude/cognition-expansion`) is off `main`; the
> canonical `docs/state/00–09` live on PR #4 (`claude/living-handoff-system`). Merge
> **PR #4 first**, then fold these deltas into the canonical files (kept here as an
> additive file to avoid a merge conflict). Per the Agent Protocol, this is the
> "after work" doc update for Wave A.

## → append to `03_CHANGELOG.md`
### 2026-06-12 · claude (Claude Code) · `claude/cognition-expansion`
- **Cognition Wave A (start):** Phase-0 dedup map (`directives/COGNITION_PHASE0.md`);
  **Event Store** (append-only `events` table + repo + `emitEvent`), instrumented on
  capture-create, upload, and the worker ingest chain (`capture_created`,
  `upload_completed`, `node_created`, `classified`, `edge_created`, `brief_generated`);
  `GET /events` replay by `correlation_id`; **VectorStore** seam (entity/tag fallback,
  pgvector deferred). Additive; no existing behavior changed. Stub-tested 12/12
  (`cognition-waveA-verify.ts`). Live status: not yet owner-verified.

## → `02_CURRENT_STATE.md` (move to 🔨 IN PROGRESS)
- **PR (Cognition Wave A) `claude/cognition-expansion`** — Event Store live on the
  branch (every instrumented write emits; a capture's lifecycle is replayable by
  `correlation_id`); VectorStore seam with entity/tag fallback. *Builds on `main`; the
  RADIAN-extending Waves B–D are sequenced after PR #3 merges.* Not yet live-verified.

## → `04_DECISIONS.md` (new ADR)
### ADR-011 — Event Store is the append-only spine
- **Context:** Current-state tables are fast but lossy (no history/replay). RADIAN's Meta
  metrics + future memory/audit need a durable, replayable record.
- **Decision:** An append-only `events` table (`actor`, `event_type`, `subject`,
  `payload`, `correlation_id`) — **never mutated or deleted**. Every pipeline write emits
  an event via best-effort `emitEvent` (an event-log failure must never fail a business
  write). Current-state tables stay the fast read path; events are audit + replay.
- **Consequence:** Full lifecycle replay by `correlation_id`; agent attribution via
  `actor` (`agent:Atlas`, `agent:Radian`, …); the seam for real agent separation later.
- **Status:** Active (Cognition Wave A).

### ADR-012 — VectorStore seam; pgvector deferred to a live verdict
- **Context:** Semantic retrieval needs embeddings, but pgvector availability on the
  basic-256mb Postgres is unverified from the sandbox.
- **Decision:** A `VectorStore` interface with an entity/tag fallback (`tagEntityStore`)
  is the active backend; a pgvector store implements the same interface with zero
  pipeline changes once the owner confirms `CREATE EXTENSION vector`. No external vector DB.
- **Consequence:** Stage-2 linking / Context Packs / Shadow Memory code against one seam.
- **Status:** Active (fallback); pgvector **DEFERRED** (owner live-check).

## → `08_CONSTRAINTS.md` (add)
- **Events are append-only** — never mutate or delete an `events` row; emitting an event
  must never fail a business write (`emitEvent` is best-effort).
- **No business truth in KV** — anything in Key Value must be reconstructable from
  Postgres (reaffirmed; see BUG-003).

## → `07_ROADMAP.md` (update)
- **Cognition Wave A** — *in-progress* (this branch): Event Store ✓, VectorStore seam ✓,
  JSONB discipline (extend, partial), KV hardening (extend, planned). **Gate:** owner
  spot-checks that a capture's lifecycle replays via `GET /events/correlation/:id` and
  similarity returns sane neighbors on real vault data.
- **Cognition Waves B–D** — *blocked-by* RADIAN 2.0 merge (PR #3): they extend RADIAN
  Stages 7/9/10, the prompt registry, and the Project Registry. Decide: merge PR #3 to
  `main` then branch B–D off `main`, **or** branch B–D off `claude/radian-2.0`.
