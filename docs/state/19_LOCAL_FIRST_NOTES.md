# 19 — Local-First / Escalation Routing (idea note, deferred)

`Last updated: 2026-06-15 · Commit: adoption-docs · By: claude (Claude Code)`

**Source of the idea:** OpenJarvis (https://github.com/open-jarvis/OpenJarvis) — a local-first
assistant. **No OpenJarvis code, dependencies, or Python/Rust services are imported.** This is an
architecture note only; **build nothing**.

## The borrowable idea
Route easy/cheap work to a **local or cheap model first**, and **escalate to Claude** only for the
hard tasks. In OpenJarvis this is a local-box assumption; for Indigold it would be a *routing
policy*, not a new service.

## How it would fit Indigold — inside the existing chokepoint
Indigold already has the seam for this: **`governedComplete` → `getTaskAdapter` → `providers.ts`**
with per-task provider selection (`LLM_CLASSIFICATION_PROVIDER`, `…_SYNTHESIS_PROVIDER`, …) and a
budget governor that already *degrades to the cheap tier* at 80%. A local-first policy is a small,
additive extension of that selection logic:

- **Cheap/local first** for `classification` and other cheap-tier tasks (e.g. an Ollama endpoint via
  the existing `ollama` provider + `OLLAMA_BASE_URL`), **escalate to Claude** for `synthesis` /
  `research` / `planning` (strong tier) — or escalate on a confidence/length signal.
- It changes **only** which adapter `getTaskAdapter` returns; the chokepoint, ledger, budget
  governor, timeout guard, and deterministic floor all stay exactly as they are.

## Why it's deferred
Current Indigold is **cloud Render + Claude API**. Local-first needs either a self-hosted **Ollama**
(the `ollama` provider already exists, unused) or a local box the owner runs — neither is in the
current deployment. Until there's a local runtime to point at, this is a **routing policy waiting
for a host**, not a feature to build.

## Activation path (when/if there's a local model)
1. Stand up Ollama (or any OpenAI-compatible local endpoint); set `OLLAMA_BASE_URL` on the worker.
2. Set `LLM_CLASSIFICATION_PROVIDER=ollama` (cheap-tier tasks go local).
3. Keep `synthesis`/`research`/`planning` on `anthropic` (escalation).
4. Optional: a confidence/size heuristic in `getTaskAdapter` to escalate mid-task.
No chokepoint change, no secrets to the PWA, deterministic floor intact. Roadmap: Phase 5.
