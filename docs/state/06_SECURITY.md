# Security

`Last updated: 2026-06-14 · Commit: phase-6-security · By: claude (Claude Code)`

## Secrets policy
- **All secrets live in Render environment variables only.** Never in the repo, never in
  code, never in examples, never in reconstructed history, never in logs or error text.
- Env var **names** are documented; **values are never** written down here.
- No `.env` files are committed (`.env.example` lists names only).

### Env var names referenced (values in Render only)
`DATABASE_URL` · `REDIS_URL` · `SESSION_SECRET` · `INTERNAL_TOKEN` · `RADIAN_URL` ·
`ENCOMPASS_URL` · `PWA_ORIGIN` · `VITE_API_URL` (PWA build) · `DAILY_TOKEN_BUDGET` ·
`STORAGE_*` (R2: endpoint/region/bucket/keys/signed-URL TTL/force-path-style) ·
**RADIAN/LLM (PR #3, all optional):** `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` ·
`GEMINI_API_KEY` · `OPENROUTER_API_KEY` · `OLLAMA_BASE_URL` · `LLM_MODE` ·
`LLM_DEFAULT/CLASSIFICATION/SYNTHESIS/RESEARCH/PLANNING_PROVIDER` ·
`RADIAN_MONTHLY_BUDGET_CENTS` · `GITHUB_TOKEN`.

## Device API token model
- A silent **per-device account** mints an opaque **Bearer** session token (no login UI).
- The iOS Shortcut file-upload branch sends `Authorization: Bearer <token>` to
  `/capture/upload`. The token is **copyable on the I/O page** and must be treated like a
  password. It is the device's credential — it is never embedded in the repo.
- On `401` (e.g. KV session eviction) the client **re-mints + retries once** (see BUG-003).

## File storage (R2)
- Cloudflare R2 via the S3-compatible AWS SDK v3 adapter. **Private bucket only.**
- A server-side guard (`assertPrivateOrThrow`) refuses to serve uploads if the deployment
  is public-writable. Files are returned **only** via short-lived **signed URLs**
  (default TTL ~15 min); **no public file URL is ever produced.**

## Privacy: sensitivity flags + AI exclusion
- Every capture carries `sensitivity ∈ public | private | internal | secret`.
- **`secret` and `internal` captures are EXCLUDED from research prompts and any
  tool-using (external) call** (web search, GitHub adapter, future tools). Enforced by
  `filterResearchSafe`/`isResearchSafe`; `POST /radian/research/:nodeId` 403s on a
  secret/internal source. Local single-shot enrichment of the owner's own item is allowed.
- See [`services/radian/PRIVACY.md`](../../services/radian/PRIVACY.md) (PR #3).

## What leaves the system, and to whom
- **On main:** nothing leaves to third-party AI (deterministic stubs). Outbound: Render
  (DB/KV), Cloudflare R2 (file bytes), and the keep-alive ping.
- **With RADIAN keys set (PR #3):** prompt content for non-secret/internal captures goes
  to the configured provider's API; research/tool calls may hit GitHub/web. Keys are sent
  in request headers only and **redacted** from any error/log.

## Network boundaries
- Public surface: only `indigold-pwa` (static) + `indigold-api` (web). `radian`/`encompass`
  are private (gated by `INTERNAL_TOKEN` `x-internal` header) when run as separate services.
- DB + KV accept internal connections only. CORS restricted to `PWA_ORIGIN` + `*.onrender.com`.
- AuthZ: scrypt password hashing; every data route is `user_id`-scoped (no cross-tenant reads).

## Pre-commit checklist (every agent runs this)
- [ ] No API keys, tokens, passwords, or connection strings in the diff (incl. tests/docs).
- [ ] No `.env` / secret files staged (`git status` clean of them).
- [ ] No secret VALUE in examples or reconstructed history — names only.
- [ ] Error/log statements redact auth headers + keys.
- [ ] If touching `apps/`/`services/`, the changelog (`03_CHANGELOG.md`) is updated (drift guard).

---

## Phase 6 audit (2026-06-14 · `claude/indigold-architecture-rnd-iYwF6`)

Full defensive review. The codebase is security-conscious: **all SQL is parameterized**
(no interpolation), passwords use **scrypt + 16-byte salt + timing-safe compare**, auth is
**Bearer-token (no cookies → no CSRF)**, uploads are **private with 15-min signed URLs +
owner check**, and there is **no `dangerouslySetInnerHTML`** in the PWA.

### Fixed this pass
- **HTTP security headers** (no new dep) on every response: `X-Content-Type-Options:nosniff`,
  `X-Frame-Options:DENY`, `Referrer-Policy:no-referrer`, `Cross-Origin-Resource-Policy:same-site`,
  and `Strict-Transport-Security` over https. (`apps/api/src/index.ts`)
- **Error-detail redaction** — routes no longer leak internal exception text to clients; the
  full reason is logged server-side only: `upload.ts` (upload + sign), `intelligence.ts`
  (encompass + radian). Client gets a stable error code.
- **Privacy gate (the big one — see Privacy model below).**

### Accepted / low-risk (documented, not changed)
- CORS allows any `*.onrender.com` subdomain — Bearer-header auth means a malicious Render site
  still cannot read the token (no cookies), so this is low risk; tighten to an exact allow-list
  if ever multi-tenant.
- `PATCH /nodes/:id` / `PATCH /projects/:id` don't use the zod `validate()` middleware, but the
  repo layer **whitelists** updatable columns, so unknown fields are dropped. Add schemas for
  consistency when convenient.
- Agent/timescale values interpolated into a couple of system prompts are **enum-typed** (not
  user input) — injection-safe; a runtime enum assert would be belt-and-suspenders.

## Privacy model (Iron #12 + Phase 6 hard rule)

**Rule:** secret/internal content is **never sent to an external provider without explicit
per-action allowance.** Enforcement is now **centralized**: `governedComplete({ localOnly })`
forces the **local deterministic adapter** ($0, no network) regardless of any provider key.
- Sensitivity is **propagated onto the node** at ingest (`node.meta.sensitivity`), so it
  survives the capture→node boundary (previously lost).
- `localOnly = !isResearchSafe(sensitivity)` is wired into **ingest, contextualize, ask
  (Companion verbs), assist**, and the **embed** job forces the local embedder for sensitive
  nodes. Outward **research/tools** already hard-skip secret/internal (`research` job →
  `skipped/privacy_excluded`; `POST /research/:nodeId` → 403).
- Pure regression: `privacy-verify` (11/11) locks the decision logic (public/private may use
  live; secret/internal → local-only; `filterResearchSafe` drops sensitive from any batch).
- Export controls + delete: see Resilience (`10_RESILIENCE.md`) — vault export bundle +
  `ON DELETE CASCADE` from `users` means a user delete removes all derived data.

## Event-sourcing integrity

The `events` table is **append-only by construction** — the repo exposes only `append`/read
methods; there is **no UPDATE/DELETE on events** anywhere (grep-verified). `emitEvent` is
best-effort and never fails a business write. Provenance (source ids, prompt version, model,
confidence) is stored on every AI-generated node/brief. History is not mutated.

## Anti-hallucination contract

Baked into the governed path + prompts, not just docs:
- System prompts instruct: cite the item, **never invent facts, and lower confidence / say so
  when evidence is thin** (e.g. the Companion `ask` system prompt). Registry prompts return
  explicit `confidence` fields that thresholds dispose (AI proposes, thresholds dispose).
- Deterministic engines (boardroom/simulation/research/mentor/time-machine) are **honest by
  construction** — they compute from real signals and show bootstrap copy when sparse rather
  than fabricating (simulation is labelled "ESTIMATES, not predictions"; research proposes
  directions, never findings).
- When a live call fails mid-flight, the **deterministic floor** answers from the item's own
  data — grounded, never a fabricated "paused" placeholder (Phase 2 audit §2.2c).

## Backup & recovery

Covered in `10_RESILIENCE.md`: `GET /radian/export-bundle` (full vault dump) + a weekly
`export_bundle` job; event replay; additive-only schema; the vault must survive loss of
Render / GitHub / provider / internet (deterministic floor keeps the app usable with no AI).
