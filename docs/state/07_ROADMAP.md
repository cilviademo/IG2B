# Roadmap

`Last updated: 2026-06-15 · Commit: owner-intents · By: claude (Claude Code)`

Status keys: **done · owner-gated · infra-gated · planned.** "Done" = code on `main`, CI-green,
matrix-tested. Owner/infra-gated work is *built or trivial* but needs an action only the owner
can take (a device check, a Render env var, a paid plan). Each item lists its gate.

## ✅ Done (code on `main` — verify in `03_CHANGELOG.md`)
- **Companion inversion — Stage 0 + Sprints 1–6 (complete):** Radian-as-Home, rich arrival cards
  + durable feedback, durable conversation threads, node-anchored/source-chip threads + thread
  search, Attention Queue ("Needs you now"), Narrative Timeline, Atlas evolution (memory-age
  patina) + workstream threads (Atlas→Radian bridge). See `19_COMPANION_INVERSION.md`.
- **Cognition Waves A–D (complete):** knowledge layers (epistemic/causal/lifecycle), Constraint
  Engine + Attention Layer (B), memory tiers + multi-timescale reviews + shadow memory (C), agent
  society + human-override constitution + wisdom layer + resilience/export bundle (D). The stacked
  PRs #7/#8/#9/#11 that built these were **closed as stale** on 2026-06-15 — the work had already
  landed on `main` via squash (verified endpoint-by-endpoint).
- **Cognition C4 — opportunity scoring (done 2026-06-15):** `scoreOpportunity` (alignment +
  revenue + confidence + urgency + capacity fit, deterministic) ranks `GET /radian/opportunities`;
  `opportunity-scoring-verify`.
- **Living OS G1–G11 (complete):** Companion verbs, Atlas node-states/Memory Palace, Time Machine,
  Quests, Progression, Boardroom, Research/Horizon, Simulation, Mentor, Companion briefing, Context
  Engineering. Plus media spike (Wave 6) built (see infra-gated).
- **Reliability gate (Codex audit P0s — complete in code):** blocking **CI**, **fatal migrations**,
  **token-only auth** (no stored password) on **durable Postgres sessions** (Redis-first cache +
  backstop, fixes BUG-003), **CORS strict toggle**, queue **bounded retries + crash recovery**,
  tested **vault restore** (captures + nodes + edges + timeline).
- **Observability (done 2026-06-15):** structured JSON request logging (`apps/api/src/lib/log.ts`,
  `requestLogger` — method/path/status/latency + request id, never query/body/secrets) atop the
  existing `GET /radian/observability` + Diagnostics surface.
- **Dependency hygiene (audited 2026-06-15):** `npm audit` = **0 vulnerabilities**. Available
  upgrades are **breaking majors** (Express 5, Zod 4, TypeScript 6, @types/node 25, @types/express
  5) — **deliberately deferred** (each needs a careful migration + re-verify across the
  no-workspaces vendored packages). Safe patch bumps (ioredis 5.11.1, aws-sdk 3.1068) available
  when convenient. Re-run the audit each quarter.

## 🔒 security (from the Intelligence & Security review — `docs/INDIGOLD_INTELLIGENCE_AND_SECURITY_REVIEW_2026-06-15.md`)
- **Finding B — prompt injection: DONE.** External content (web results, scraped pages, transcripts,
  fetched source) is fenced via `fenceUntrusted` + `UNTRUSTED_GUARD` so it's treated as data, never
  instruction. `sanitize-verify`.
- **Finding A — scoped capture token: DONE.** Hashed, scoped `capture_tokens` + `requireAuthOrCapture`
  on the ingest endpoints only (`capture:text|file`); a capture token authenticates nowhere else.
  Generate/revoke in **Diagnostics → Capture tokens**; `/capture?raw=…` path untouched. **Owner:**
  switch the Shortcut to a generated capture token (docs updated).

## 🧠 intelligence / open-information program (review proposals — owner prioritizes; Phase 0→5)
- **Phase 1 — evidence foundation + claims: DONE.** `ExternalEvidence` contract + Research Inbox
  (`/radian/evidence`); **Claims layer** (`claims.ts` + `claims` table + `/radian/claims`) with
  confidence-from-evidence, **freshness** (`claimStale`), and **contradictions** (`/radian/tensions`).
  **Still in this theme:** **negative knowledge** (remember searched-but-not-found / retracted /
  excluded) and **"why did Radian show me this?"** provenance surfacing.
- **Phase 2 — connectors: RSS/Atom · Crossref · OpenAlex · Wikipedia DONE** (`rss`/`crossref`/
  `openalex`/`wikipedia` + `feeds`/`watchlists` + `poll_feed`/`run_watchlist`). **Phase 4 next:**
  arXiv / Europe PMC / Hacker News / FRED / regulatory (same contract + gate).
- **Phase 3 — evidence UX: Research Inbox · Tensions · World Lens · Evidence Drawer · Watchlists ·
  owner intents (My memory/Explain/Check/Research/Decide) all DONE.** Remaining: **negative
  knowledge** (remember searched-but-not-found / retracted / excluded).
- **Phase 5 — evaluation + proactive intelligence:** golden vault, retrieval metrics, weekly change
  detection, decision-review triggers. Plus **full correlation-trace diagnostics** end-to-end.

## 👤 owner-gated (built/trivial — needs an on-device or Render action)
- **Device phone-gates (constraint #5 — the live gate):** confirm each shipped sprint behaves on
  iPhone — ask Radian → restart → thread resumes; source-chip → node thread; "Needs you now" ranks
  real items; Timeline shows real chapters; project node → "Discuss workstream"; Atlas patina rings
  deepen with memory age; login + token-eviction re-login (no vault fork). Tracked in `09_PHONE_GATES.md`.
- **CORS lockdown:** set `CORS_ALLOW_ONRENDER=false` on the API once `PWA_ORIGIN` is confirmed.
- **pgvector retrieval:** run `CREATE EXTENSION vector` on the Render Postgres; `GET /radian/pgvector-check`
  returns the verdict; the `VectorStore` seam flips with zero pipeline change (else stays on tag retrieval).
- **Live web research:** add `TAVILY_API_KEY` (or `BRAVE_API_KEY`) → Radian Research/Web modes cite real sources.
- **iOS Shortcut file branch:** build the Shortcut + paste the device token (`CAPTURE_DEEPLINK.md`).

## 🔧 infra-gated (needs a paid plan / live stack)
- **Phase 3 — Wave 6 media pipeline:** built + inert. Uncomment `indigold-media-worker` in
  `render.yaml` (paid), set `MEDIA_WORKER=on`, run the RTF spike (`17_WAVE6_MEDIA_SPIKE.md`), share a
  YouTube/podcast URL → transcribed + synthesized node.
- **Always-on background jobs:** set the API to Render `starter` (~$7) so scheduled briefs/reviews/
  consolidation fire without cold-start gaps.
- **e2e integration test:** needs the deployed Postgres+Redis+API+worker stack (the verify matrix
  covers pure logic; DB round-trips are owner/CI-run).
- **True SSE token streaming:** Radian answers currently client-reveal (typewriter); real
  token-by-token streaming is a backend follow-up.

## 📋 planned / optional
- **More tool adapters** (arXiv / YouTube / Gmail / Notion) behind the `ToolAdapter` seam — per-adapter need + auth.
- **Real execution agents** — Stage-6 drafts exist; gated behind per-kind opt-in flags (`RADIAN_EXECUTOR_<KIND>`, default off).
- **Major dependency upgrades** (Express 5 / Zod 4 / TS 6) — schedule as a dedicated, verified migration.

> Originating directives (file-upload, Vault redesign, RADIAN 2.0, Living OS, Companion inversion,
> the 6-sprint product strategy) arrived as chat prompts; their essential content lives here + in
> `19_COMPANION_INVERSION.md`, `docs/RADIAN_2.0.md`, and the deep docs.
