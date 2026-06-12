# RADIAN — Privacy boundary

RADIAN is a personal intelligence system. The privacy boundary (Iron principle #7)
governs what may leave the owner's vault.

## Sensitivity levels
Every capture carries a `sensitivity`: `public` · `private` · `internal` · `secret`.

## The rule
- **`secret` and `internal` captures are EXCLUDED from:**
  - **research prompts** (Stage 4) — they never become part of a web/news/docs query, and
  - **any tool-using call** — web-search, the GitHub adapter, or any future `ToolAdapter`.
- `public`/`private` captures may participate in research and tools.
- Local, single-shot enrichment of the owner's *own* item (Stages 1–2 ingest/contextualize,
  brief synthesis) operates on the full vault — this is the owner's own model call, not an
  outward-facing query — but research/tool **inputs** are always filtered first.

## Where it's enforced
`packages/shared/src/model.ts`:
- `isResearchSafe(sensitivity)` — boolean gate.
- `filterResearchSafe(items)` — drops `secret`/`internal` before building any research or
  tool input. Research jobs and tool calls MUST pass their candidate set through this filter.

## Test (Wave 1 gate)
A `secret`-flagged capture is created, a research/tool input set is assembled, and the test
asserts the secret item's id/content never appears in the assembled prompt or tool arguments.
A failing exclusion fails the build.

## Provenance
Every AI output records source ids; a `secret`/`internal` source id never appears in a
research-derived capture's provenance, because it was filtered before the call.
