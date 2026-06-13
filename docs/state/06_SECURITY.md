# Security

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

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
