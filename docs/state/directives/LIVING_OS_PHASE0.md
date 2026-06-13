# Living OS — Phase 0 dependency map

`Last updated: 2026-06-13 · Commit: integration · By: claude (Claude Code)`

Per the directive: map each of the 14 systems → the existing primitive it rides on, and
sequence anything whose dependency isn't built yet **behind** it (no fakery). **Cost law:**
ambient liveliness is computed from existing data at render time (free); model calls only on
explicit taps or scheduled jobs (Sentinel-governed).

> ⚠️ **Prerequisite (structural):** Living OS is PWA-heavy **and** rides on the cognition
> backend. It needs a **full-app trunk** = the cognition backend (`claude/cognition-wave-d`,
> which stacks Waves A–D on the integration trunk) **+** the reconciled PWA (`claude/pwa-integration`,
> PR #10). Build Living OS on that merged trunk. Most of this directive is **UI + thin
> orchestration** over primitives that already exist.

| # | System | Rides on (existing primitive) | Verdict |
| :-- | :-- | :-- | :-- |
| 1 | **Companion Panel ("Ask Radian")** | assist/research/simulate jobs + `POST /radian/*` + event status | **NEW (orchestration)** — verb→endpoint router (`POST /radian/ask`) + PWA action sheet. **Build first.** |
| 2 | Quest System | next-actions (assist) + lifecycles (B3) + Project Registry + events | **EXTEND** — quest = goal node + ordered action steps + lifecycle state; constraint-vetted before offered. |
| 3 | Skill Trees & XP | classification domains + `depends_on` edges + Atlas renderer | **NEW (XP) + EXTEND (Atlas tech-tree mode)** — XP weights in config; alternate hierarchical layout. |
| 4 | AI Party Members | strong tier + prompt registry; used by Oracle + quarterly reviews | **NEW (prompt framings)** — 7 personas, ONE structured call, "Where they split" mandatory. Not new agents. |
| 5 | Relationship Graph | person nodes + edges + Chronos + capture mentions | **EXTEND** — trust/importance/frequency/strength (decaying); owner-facing only, excluded from research (privacy). |
| 6 | Opportunity Radar | Stage 7 opportunity engine (B?/RADIAN) + signal_to_noise (B6) | **EXTEND (UI)** — Civ-advisor card UI; dismiss trains signal_to_noise. |
| 7 | "What If?" Simulations | Stage 10 Oracle simulation (+ C6 grounding) | **EXTEND (UI)** — entry point + preset prompts; label "estimate", show assumptions; past sims diff. |
| 8 | **Living Atlas** | attention (B6) + consolidation decay (C1) + `blocks` edges (B2) + constraint (B4) | **NEW (render-time states)** — Growing/Decaying/Blocked/Dormant/Emerging/Critical; pure `computeNodeState`, zero model calls. **Build first.** |
| 9 | Memory Decay surfaced | consolidation decay + Shadow Memory (C1/C3) | **EXTEND (UI)** — Dormant/Decaying in Atlas + "From the vault" already in monthly review. |
| 10 | Character Sheet | attention/XP/throughput + owner self-reports; Constraint Engine (B4) | **NEW** — self-reported vs computed, strictly separated; **AI never infers health/psych states** ("—" when empty). |
| 11 | **Mission Control briefing** | daily_brief prompt (Stage 5) + events provenance | **EXTEND (prompt)** — commander's-briefing structure (situation→detections→focus 1,2,3→risk). **Build first.** |
| 12 | Time Machine | Event Store (Wave A) + embeddings (pgvector/seam) + decision journal | **EXTEND (UI)** — range-select + cheap-tier synthesis over a window; cites event ids; reversals as calibration cards. |
| 13 | Idea Incubator | lifecycle machine (B3) | **EXTEND (UI)** — Seed→Growing→Emerging→Validated→Product; gate criteria proposed by Radian; promote past Emerging needs owner confirm. |
| 14 | Conversational OS | §1 + Encompass + agent society | **EXTEND** — every object → Companion Panel; global "Ask Indigold" routes to the right agent, answers cite nodes. The acceptance test of the whole directive. |

## Build order (matches the directive; gated by owner phone-test)
- **G1:** Companion Panel (§1) + Living Atlas states (§8) + Mission Control voice (§11) — *alive in one wave, almost all from existing data.*
- **G2:** Quests (§2) + Incubator (§13) + Decay surfacing (§9).
- **G3:** Skill trees + tech-tree view (§3) + Character Sheet (§10) + Relationship graph (§5).
- **G4:** Party Members (§4) + Opportunity Radar UI (§6) + What-If (§7) + Time Machine (§12) + global Ask (§14).

## Dependencies not yet on the build base (sequence behind them)
- **Cognition B/C/D** (attention, lifecycles, constraints, agents, memory tiers, reviews) live on
  PRs #7/#8/#9 — Living OS G1–G4 need them, so the build base is `cognition-wave-d`, not the
  bare integration trunk.
- **pgvector** (§12 Time Machine quality) — verdict via `GET /radian/pgvector-check`; the
  `embeddings` table + `VectorStore` seam are ready; embeddings activate when the owner confirms.
- **PWA design base** — `pwa-integration` (PR #10) is the Vault-styled frontend Living OS renders in.

## This branch (`claude/living-os`) delivers now
- **pgvector readiness:** `embeddings` table (extension-agnostic JSONB vector) + `GET /radian/pgvector-check` (one-curl verdict). The two flagged "revisit" items are now addressed (frontend reconciliation = PR #10; pgvector = here).
- This Phase 0 map. The G1–G4 feature build is the next major effort, on the merged full-app trunk.
