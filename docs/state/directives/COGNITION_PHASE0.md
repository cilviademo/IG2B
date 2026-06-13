# Cognition Expansion — Phase 0 dedup map

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

Per the directive: map each section to its existing implementation (or its RADIAN 2.0
wave if not yet built) and state **extend / new / defer**. **Code is truth.**

> ⚠️ **Dependency:** most of Waves B–D *extend* RADIAN 2.0 constructs that live only on
> the unmerged `claude/radian-2.0` branch (PR #3) — consolidation (Stage 9), opportunities
> (Stage 7), simulation (Stage 10), prompt registry, Project Registry, the governed
> `ModelAdapter`. **Wave A is RADIAN-independent** (it instruments write paths on `main`)
> and is built now. Waves B–D are sequenced **after** RADIAN merges (or branch off it).

## Wave A — Data Foundations (RADIAN-independent → build now off main)
| § | Item | Existing? | Verdict |
| :-- | :-- | :-- | :-- |
| A1 | Event Store | none | **NEW** — append-only `events`; instrument capture/upload/worker writes. |
| A2 | pgvector Semantic Memory | none; RADIAN added `ModelAdapter.embed` seam + deterministic hash-embed | **NEW (seam) + DEFER (live)** — `VectorStore` interface + entity/tag fallback now; pgvector verdict pending owner live-check on basic-256mb. |
| A3 | JSONB metadata discipline | partial — `captures.raw`, `nodes.meta` (RADIAN), `jobs.payload`, `audit_logs.meta` already JSONB | **EXTEND** — add `schema_version` inside payloads; promote to columns only when indexed. |
| A4 | KV hardening | `redis()` + KV for sessions, rate limits, usage, scheduler `lastrun` | **EXTEND** — formalize locks/TTL/heartbeat; boot-time warmup; "no business truth in KV" already a lesson (BUG-003). |

## Wave B — Knowledge Layers (extend RADIAN; sequence after merge)
| § | Item | Existing | Verdict |
| :-- | :-- | :-- | :-- |
| B1 | Epistemic truth types | `nodes.truth_layer/truth_label` (A–F); RADIAN `meta` | **EXTEND** — add `epistemic_type` to node meta + UI badges. |
| B2 | Causal edge vocabulary | `edges.relationship` free text; RADIAN Stage-2 typed edges (`similar/contradicts/depends_on/extends`) | **EXTEND** — add `causes/blocks/accelerates/evidence_for/evidence_against/supports`; map old types. |
| B3 | Lifecycles / state machines | `projects.status` (active/dormant, RADIAN) | **EXTEND** — generic `lifecycle` state + `state_transition` events. |
| B4 | Constraint engine | none | **NEW** — `constraints` profile + inject into planning prompts. |
| B5 | Hypothesis engine | none (RADIAN has Opportunity/Decision, not Hypothesis) | **NEW** — `hypothesis` nodes + evidence edges + `hypothesis_updated`. |
| B6 | Attention layer | `nodes.mvs` only | **NEW** — importance/urgency/attention_score/signal_to_noise pass. |

## Wave C — Memory & Strategy (extend RADIAN; sequence after merge)
| § | Item | Existing (RADIAN wave) | Verdict |
| :-- | :-- | :-- | :-- |
| C1 | Consolidation tiers | Stage 9 consolidate (MVS strengthen/decay + themes) | **EXTEND** — add working/long_term/core tiers (core needs owner confirm). |
| C2 | Multi-timescale reviews | daily/weekly briefs (Stage 5) | **EXTEND** — add monthly/quarterly/annual; each compounds on prior. |
| C3 | Shadow Memory | none | **NEW** — monthly resurrection job (needs embeddings → A2). |
| C4 | Opportunity scoring | Stage 7 opportunities | **EXTEND** — add revenue/alignment; check Constraint Engine (B4). |
| C5 | Narrative layer | none | **NEW** — season tagging + quarter/year narratives. |
| C6 | Simulation grounding | Stage 10 simulation | **EXTEND** — consume constraints/lifecycle/hypothesis/calibration. |

## Wave D — Governance, Agents, Resilience (extend RADIAN; sequence after merge)
| § | Item | Existing | Verdict |
| :-- | :-- | :-- | :-- |
| D1 | Agent society (namespacing) | jobs carry no actor; events `actor` (A1) | **EXTEND** — namespaced job classes + prompt sections + `actor` on every call/event. |
| D2 | Human override (constitutional) | RADIAN "AI proposes, thresholds dispose" (ADR-008) | **EXTEND** — add never-delegated domains + owner-only core memory. |
| D3 | Wisdom layer | none | **NEW** — owner-authored `principles` + quarterly "what matters" check. |
| D4 | Resilience & no lock-in | export/import JSON exists; idempotent boot; R2 external | **EXTEND + NEW** — `export_bundle` job (nodes/edges/events/embeddings-meta → R2) + `docs/state/10_RESILIENCE.md` runbook. |

## This turn delivers (Wave A start, additive, off main)
- **A1 Event Store** — table + repo + `emitEvent`, instrumented on capture-create / upload / worker ingest chain; `GET /events` replay by `correlation_id`. Stub-tested.
- **A2 `VectorStore` seam** — interface + entity/tag fallback; pgvector verdict **DEFER** (owner live-check).
- Docs/state updated (changelog, current-state, decisions, roadmap) per the Agent Protocol.
