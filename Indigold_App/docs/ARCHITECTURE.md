# ARCHITECTURE.md — Indigold v0.1 Prototype

## Purpose
The v0.1 PWA is the **capture / review / mission-control surface** for the
Indigold architecture, validated against synthetic fixtures before any real data
is ingested. It is deliberately a thin client: no backend, no bundler, no cloud.

## Runtime model
```
┌──────────────────────────────────────────────┐
│  index.html  (app shell + iOS PWA meta)        │
│  ├─ styles.css  (mobile-first, safe-area)      │
│  ├─ app.js      (router · views · md · atlas)  │
│  └─ service-worker.js (offline cache)          │
└───────────────┬──────────────────────────────┘
                │ fetch() — relative, same-origin only
                ▼
   Synthetic fixtures (read-only in v0.1)
   sample_nodes.json · sample_edges.json · sample_timeline.json
   sample_context_pack.md · sample_dashboard.md · sample_weekly_brief.md
   fake_vault/** (body files) · schemas/** (contracts)
```

- **No framework.** Vanilla JS in one IIFE. A hash router (`#inbox` … `#io`)
  swaps the seven views into `<main id="view">`.
- **State** is held in memory (`nodes`, `edges`, `timeline`, `byId`). Import
  replaces it; Export serializes it. v0.1 does not persist edits.
- **Markdown** is rendered by a minimal in-file parser (headings, lists, tables,
  blockquotes, inline) — no external library, to keep the offline guarantee.
- **Liminal Atlas** is a self-contained `<canvas>` force-directed layout (no
  CDN). Node radius encodes Memory Value Score; color encodes Truth Layer.

## File / folder map
```
Indigold_App/
├── index.html              # app shell, PWA + iOS meta, tab bar, modal
├── manifest.json           # name, standalone, icons, theme color
├── service-worker.js       # cache-first shell + cache-only fixtures
├── app.js                  # router, views, markdown, atlas, import/export
├── styles.css              # mobile-first theme (indigo + gold), safe-area
├── assets/icons/           # PNG icons (192/512/maskable/apple-touch) + SVG + generator
├── sample_nodes.json       # entities: projects, people, concepts, …
├── sample_edges.json       # temporal relationships (valid_from / valid_until)
├── sample_timeline.json    # multi-track temporal events
├── sample_context_pack.md  # Encompass-assembled, token-budgeted bundle
├── sample_dashboard.md     # Mission Control surface
├── sample_weekly_brief.md  # Radian directional intelligence
├── schemas/                # JSON Schemas: node, edge, memory, context_pack
├── fake_vault/             # mirrors the Indigold vault taxonomy (synthetic)
│   ├── 00_INBOX/ … 10_PRIVATE_SECURE/
├── docs/                   # SYSTEM_RULES, ARCHITECTURE, SECURITY_MODEL, ROADMAP
├── .gitignore
└── README.md
```

The `fake_vault/` mirrors the canonical Indigold taxonomy so the prototype can
validate folder semantics without any real content.

## Schema contracts (`schemas/`)
| Schema | Requires | Encodes |
| :-- | :-- | :-- |
| `node.schema.json` | id, type, title, created_at, updated_at, truth_layers | provenance, Memory Value Score, privacy, owning engine |
| `edge.schema.json` | id, source_id, target_id, relationship_type, valid_from | temporal validity, weight, provenance |
| `memory.schema.json` | score, lifecycle, factors | Knowledge Economics scoring |
| `context_pack.schema.json` | id, purpose, token_budget, source_nodes, assembled_at | Context Engine bundle frontmatter |

## Platform terminology surfaced in the UI
- **Encompass** — unified retrieval / context-assembly layer (Context Pack view).
- **Radian** — directional intelligence: forecasting, opportunity scoring,
  way-ahead briefs (Weekly Brief view).
- **Liminal Atlas** — interactive knowledge-graph / relationship-mapping surface.

## Explicit non-goals for v0.1
No real data, no persistence of edits, no agents, no model calls, no monitoring,
no cloud sync, no onboarding. See `ROADMAP.md`.
