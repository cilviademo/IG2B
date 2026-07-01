# 22 — Skill Registry (Wave 8: the OS for capabilities)

`Last updated: 2026-06-18 · Commit: skill-registry · By: claude (Claude Code)`

The foundation that turns Radian from "Claude in a PWA" into an **operating system for capabilities**:
every capability — internal verbs, MCP tools, and future owner-generated skills — describes itself
with ONE schema, and Radian routes by **discovering** skills instead of a hardcoded switch. Evaluated
from the owner's Tier-1 brief; agentskills-compatible in spirit. **Nothing new bypasses the governed
layer — the registry describes, it never executes.**

## The unified `Skill` (`packages/shared/src/skill.ts`)
`id · name · description · kind(verb|mcp_tool|generated|connector) · access(reason|read|write) ·
inputs · outputs · on[] · requiredPermissions · requiresConfirmation · enabled · source · governed:true`.

Adapters make the existing pieces speak it — no rewrites:
- **`verbToSkill(VerbSpec)`** — the internal `living-os.ts` verbs (explain/research/simulate/…). First-party,
  governed, `enabled: true`; job verbs = `reason` access, `create_task` = `write`.
- **`mcpToolToSkill(McpToolMeta, connectorId)`** — the dormant MCP tools (`20_MCP_CONNECTOR_SEAM`). Carries
  the tool's read/write, permissions, confirmation, and **`enabled: false`** default-deny.
- **generated** (future, Hermes-inspired) — owner-approved skills written from repeated patterns.

Registry + gate: `buildSkillRegistry`, `findSkill`, `skillsFor(subject)`, `discoverableSkills`, and
`skillGate` (verbs always allowed; external skills default-deny → need enable + permissions, writes need
per-action confirmation — mirrors the MCP gate). Endpoint: **`GET /radian/skills?subject=`** (read-only).
`skill-verify` (23).

## Safety posture (unchanged invariants)
- **Single governed chokepoint:** every skill still runs through `governedComplete` / the job pipeline.
- **Default-deny for anything external** (MCP + generated): disabled until the owner enables it; writes
  require confirmation; results are untrusted (fenced). Verbs are first-party and always allowed.
- **No auto-execution** of generated skills — they enter a review queue like Opportunities/Quests.
- No secrets to PWA/logs; provenance events on use.

## Roadmap this unlocks (owner's Tier-1/2/3, sequenced)
1. **Skill Registry** — this PR (schema + adapters + registry + `GET /radian/skills`). ✅
2. **Advanced memory scoring** (#4) — decompose `node.mvs` into importance · novelty · recency · reuse ·
   confidence · connection-density · citation-frequency. Pure/deterministic; sharpens Atlas + the
   auto-linker + World Lens + retrieval. **Next PR.**
3. **A2A-ready** (#2) — an `A2APeer` adapter behind the SAME governed chokepoint (like the MCP seam);
   architect now, no live wiring. `AI ↔ AI` becomes just another governed provider.
4. **Self-improving skills** (#3, Hermes idea, NOT its code) — Radian notices a repeated pattern (e.g.
   "Create DFAC menu") → **proposes** a `generated` skill into a review queue → owner approves → it's a
   discoverable governed skill. Never self-executing.
5. **Read-only MCP activation** (#6) — enable a real connector's read tools (they're already `Skill`s);
   gated writes later, per-action confirmation.
6. **Browser-agent integration** (#5, Wave 8) — Browser-Use/Stagehand/Firecrawl-style automation exposed
   as a `connector` skill under this abstraction, replacing fragile scraping. Heaviest lift + security
   surface; deferred.

## Not adopted (owner's Tier 4)
LangGraph / CrewAI / AutoGPT / MetaGPT / full OpenJarvis — Indigold already has Boardroom / Companion /
Mentor / Radian / Atlas / Context Packs; importing a second opinionated orchestrator adds complexity
without product gain. Borrow ideas (Hermes self-writing, OpenClaw architecture, adaptive memory), not code.

## The target request pipeline (why this matters)
`Question → Intent Engine → Memory Retrieval → Atlas Context → Installed Skills → MCP Tools → Boardroom
Personas → External Knowledge → Reasoning → Action Plan → Learning → Memory Update`. Steps already exist
(intents, retrieval/embeddings + auto-link, World Lens/evidence, Boardroom, governed reasoning); the
**Skills** and **MCP Tools** stages are what this registry makes first-class.
