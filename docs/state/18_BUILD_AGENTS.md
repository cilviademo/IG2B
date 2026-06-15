# 18 — Build-Time Claude Code Agents (development accelerators)

`Last updated: 2026-06-15 · Commit: adoption-docs · By: claude (Claude Code)`

**Scope:** these are **build-process** agents for Claude Code — they help *develop* Indigold.
They are **NOT** runtime app code, are **not** bundled into the PWA/API/worker, and do **not**
call any provider at runtime. Adapted in spirit from `agency-agents`
(https://github.com/msitarzewski/agency-agents, MIT) — **no files were imported or committed**;
this is a curated mapping in Indigold's own words.

## Install (dev machine only — not the repo, not the deploy)
Claude Code reads agents from **`~/.claude/agents/`** (global) or **`.claude/agents/`** (per-repo,
git-ignored). To adopt:

```
git clone https://github.com/msitarzewski/agency-agents /tmp/agency-agents   # outside this repo
# copy ONLY the four useful divisions' agents you want into ~/.claude/agents/ :
#   engineering · security · design · testing
# skip: game-dev, GIS, commerce, China-platform marketing, etc.
```

> The sandbox that wrote this doc is repo-scoped (no external clone), so the clone/copy is an
> owner step on the dev machine. Nothing external is committed to Indigold.

## The 12 agents worth installing, mapped to Indigold work

| # | Agent (division) | Invoke when… | Indigold phase / surface |
|---|---|---|---|
| 1 | **Code Reviewer** (engineering) | every PR before merge | all — matches the existing `/code-review` discipline |
| 2 | **Security Architect** (security) | auth, capture-token, MCP seam, governed-AI changes | Security findings · Part 5 MCP |
| 3 | **AppSec Engineer** (security) | input handling, prompt-injection fences, untrusted evidence | Finding B · connectors · MCP |
| 4 | **Accessibility Auditor** (design) | any new PWA screen | Research Inbox · World Lens · Tensions · History |
| 5 | **Performance Benchmarker** (engineering) | latency/queue work | RADIAN latency (BUG-009) · worker concurrency |
| 6 | **UX Designer** (design) | flows & information architecture | Companion intents · Evidence Drawer |
| 7 | **Mobile UI Designer** (design) | iPhone-first layout, tap targets, safe-area | PWA shell · capture flows |
| 8 | **Test Engineer** (testing) | new pure logic → a `*-verify.ts` suite | the verify matrix (711 checks) |
| 9 | **Reality Checker / Evidence Collector** (testing) | claims about "it works" need proof | evidence/claims layer · verification discipline |
| 10 | **Multi-Agent Systems Architect** (engineering) | persona/boardroom design, connector orchestration | Part 2 personas · Part 5 MCP |
| 11 | **Voice AI Integration Engineer** (engineering) | speech capture / TTS | Companion mic/voice |
| 12 | **Product Manager / Technical Strategist** (engineering) | sequencing & scope calls | `07_ROADMAP.md` upkeep |

## How this maps to the existing skills
Indigold's repo already ships first-party Claude Code skills (`/code-review`, `/security-review`,
`/verify`, `/simplify`, `/run`). The agents above **complement** these: skills are in-repo
workflows; agents are reusable personas you summon for a task. Prefer the in-repo skills for the
gated paths (review/verify) and reach for an agent when you want a focused specialist lens.

## Guardrails (unchanged)
No agency-agents files imported/committed · no runtime code added · no PWA bundling · no secrets ·
agents never run in production. This file is documentation only.
