# ROADMAP.md — Indigold

## v0.1 (this prototype) — DONE WHEN the acceptance checklist passes
Prove the architecture against **synthetic** data: schemas, mobile-first PWA,
offline, seven views, Liminal Atlas placeholder, Import/Export round-trip.

### Acceptance checklist
- [ ] Installs to iPhone Home Screen; launches standalone (no Safari chrome).
- [ ] Loads in Airplane Mode after first cache.
- [ ] All seven tab views render from `sample_*` fixtures.
- [ ] Atlas renders nodes/edges; tapping a node shows Truth Layer + Memory Value Score.
- [ ] Context Pack viewer shows token budget + provenance.
- [ ] Import/Export round-trips the local JSON dataset.
- [ ] Zero network data calls; zero references to any real vault path.

## Deliberately deferred (NOT in v0.1)
These are roadmap-only; do not implement in the prototype.

### Persistence & sync
- IndexedDB/SQLite-WASM persistence of edits; Git-based versioning of wiki pages.
- Optional cloud **sync/backup** (never source of truth), encryption-at-rest.

### Intelligence layers
- **Monitoring Engine / Research Engine** — passive + scheduled monitoring, change
  detection, watchlists, alerting, discovery.
- **Model adapter layer** — thin, vendor-agnostic interface so Claude/OpenAI/Gemini
  are interchangeable; no vendor shape in business logic.
- **Encompass** — real hybrid retrieval (lexical + vector + graph) and context
  assembly, replacing the static sample pack.
- **Radian** — real forecasting, opportunity scoring, way-ahead briefs.

### Economics & budgeting (roadmap)
- **When to research vs. do nothing:** the Opportunity Engine estimates expected
  ROI; if API/compute cost exceeds strategic value, the system does nothing.
- **Hard token budgets** per agent session; budget warnings at 80% of monthly
  allocation.
- **Tiered fallbacks:** premium APIs (e.g. Firecrawl/OpenAI) degrade gracefully to
  free/self-hosted (e.g. local SearxNG, local Llama) for continuous operation.

### Scale targets (architecture must anticipate)
- 10+ years, 1M+ notes, billion-edge graphs, multiple concurrent providers.
- Timeline scaling: partitioned queries (e.g. `events_2026`) + UI virtualization;
  multi-track rendering by event type.
- Atlas scaling: level-of-detail, clustering, off-main-thread layout.

### Onboarding (later phase only)
Identity Interview → Voice → Values → Decision Style → Taste → Projects →
Historical Import → Relationships → Goals. **Not** run in v0.1; the prototype
ships an empty synthetic identity placeholder.
