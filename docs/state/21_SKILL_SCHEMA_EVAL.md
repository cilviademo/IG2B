# 21 — Skill Schema / Verb Catalog Evaluation (recommendation; report-only)

`Last updated: 2026-06-15 · Commit: adoption-docs · By: claude (Claude Code)`

**Question:** should Indigold adopt an `agentskills.io`-compatible skill schema?

## Current model (what exists)
`packages/shared/src/living-os.ts` — `VerbSpec { verb, label, fulfilment, on[] }`, `VERBS` (8
verbs: explain/teach/next_steps/research/simulate/challenge/create_task/context_pack), `verbsFor`
(filter by entity), `findVerb` (lookup). Each verb is **orchestration only** — it maps to an
existing job (`ask`/`assist`/`research`/`simulation`/`context_pack`) or a sync action
(`create_task`). The Companion/Ask-Radian panel renders `verbsFor` and dispatches via `findVerb`.
This is a clean, closed, **first-party** catalog: inputs are implicit (the subject entity),
fulfilment is an internal job, there are no external callers.

## agentskills-style concepts (for comparison)
name · description · typed inputs/outputs · invocation contract · permissions · discovery metadata ·
safety constraints. These matter when **third parties discover and invoke** your skills, or when
**you invoke external** skills/tools.

## Recommendation — **do NOT retrofit the verbs now.** Add the schema only at the MCP boundary.
Honest read: for *internal* verbs, the current model is **sufficient** — adding name/description/
inputs/outputs/permissions ceremony to 8 first-party verbs that all route to known jobs buys
nothing and adds maintenance. **Don't add ceremony.**

The place a descriptor schema earns its keep is the **external** surface: when MCP tools (Part 5) or
external "skills" enter, *they* are untrusted and need exactly that metadata — typed I/O, read/write
classification, permissions, confirmation, provenance. So:

- **Keep `VerbSpec`/`findVerb`/`verbsFor` exactly as-is** (deterministic-first, no break).
- **Define the skill/tool descriptor as part of the MCP connector contract** (`20_MCP_CONNECTOR_SEAM.md`),
  where external tools live — `name · description · inputs · outputs · read|write · permissions ·
  confirmation · safety/untrusted · provenance`. Internal verbs can later expose a thin read-only
  *view* in that shape **for discovery** without changing their runtime.
- **Treat every external skill as untrusted:** prompt-injection fence on results (reuse
  `fenceUntrusted`), default-deny, no code/network outside the governed systems.

**Net:** one schema, at the boundary that needs it (MCP), not bolted onto the internal verb router.
If/when a Companion "skill discovery" feature is built, it reads the same descriptor. Verify suite
+ injection guard land with the MCP seam, not here. No implementation in this evaluation.
