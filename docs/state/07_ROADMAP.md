# Roadmap

`Last updated: 2026-06-12 · Commit: audit-p0 · By: claude (Claude Code)`

Status keys: **planned · in-progress · blocked · done→changelog.** Each item lists its
source directive and the gate that unblocks/closes it.

## Reliability gate (Codex audit 2026-06-15) — address before the next big feature wave
- **DONE:** blocking **CI**; **fatal migrations**; **plaintext-password fix** (claimed accounts are token-only — password never persisted; `ensureSession` re-prompts login instead of forking; "session expired" banner); **CORS** strict toggle (`CORS_ALLOW_ONRENDER=false` drops the blanket `*.onrender.com` trust).
- **OWNER:** set `CORS_ALLOW_ONRENDER=false` on the API once `PWA_ORIGIN` is confirmed; on-device verify login + token-eviction re-login (no vault fork). Pairing (secondary) still carries a password by design.
- **DONE:** queue **bounded retries** (re-queue to head until cap=3, then dead-letter) + **crash recovery** (`recoverStale` requeues orphaned `:processing` jobs at worker startup).
- **DONE:** tested **vault restore** (`/io/import` now restores captures (Truth Layer A, id-preserving + idempotent) + nodes + edges via pure `normalizeImport*`; `import-verify`).
- **NEXT from the audit:** e2e integration test, structured observability, dependency hygiene; the secure token-only auth re-do (owner-confirmed login first). Tracked in `docs/REPOSITORY_AUDIT_2026-06-15.md` (Codex branch).

## In-progress (open PRs — merge gate = owner live-test)
- **File upload (PR #1 `claude/indigold-file-upload`)** — *in-progress.* PWA file picker +
  offline queue + signed-URL refresh (backend already on main). **Gate:** owner shares a
  photo via the form → `uploaded ✓`, opens it from the vault; oversize blocked; airplane-mode
  queue re-uploads on refresh. Source: "File Upload Branch Build Plan".
- **Vault redesign (PR #2 `claude/indigold-vault-redesign`)** — *in-progress.* Dark-default
  token system, self-hosted fonts, Atlas constellation, all screens, SW v0.22.0. **Gate:**
  owner quit-reopens ×2; Home/Atlas/Inbox/Brief read true in dark + light. Source: "Vault
  redesign directive".
- **RADIAN 2.0 (PR #3 `claude/radian-2.0`)** — *in-progress.* Intelligence layer Waves 0–4 +
  multi-provider LLM framework. **Gate (per wave, needs a provider key):** repo-share →
  classify+link+relevance+playbook+NEXT ACTIONS; research → finding captures; budget force-test
  ($0.01→queue); secret-exclusion test green. Source: "RADIAN 2.0 Build Directive".

## In-progress (owner-gated)
- **Phase 3 — Wave 6 media pipeline (`claude/phase3-media` → main)** — *built, inert until deployed.*
  `media_extract` on a dedicated Redis queue → Docker media-worker (yt-dlp captions/audio +
  ffmpeg + faster-whisper, baked model) → transcript → existing `media_ingest` synthesis.
  **Gate:** owner uncomments the `indigold-media-worker` block in `render.yaml` (paid plan),
  sets `MEDIA_WORKER=on`, runs the RTF timing spike (`17_WAVE6_MEDIA_SPIKE.md`), and shares a
  YouTube link (captions path) → a transcribed+synthesized node; then an audio/podcast URL.

## Planned (not started)
- **iOS Shortcut file branch (live wiring)** — *planned, docs done.* The recipe is in
  `CAPTURE_DEEPLINK.md`; needs the owner to build the Shortcut + paste the device token.
  **Gate:** a file shared from the iOS share sheet lands in the vault.
- **Wire RADIAN endpoints into the PWA** — *planned.* Surface `/radian/actions` (NEXT
  ACTIONS) on Home, opportunities/decisions/simulation UIs. **Blocked-by:** PR #3 merge.
- **pgvector retrieval** — *planned / blocked.* Stage-2 retrieval falls back to entity/tag;
  embeddings path is wired behind `ModelAdapter.embed`. **Gate:** owner verifies
  `CREATE EXTENSION vector` works on the basic-256mb Postgres; else stay on tag retrieval.
- **More tool adapters** — *planned.* arXiv / YouTube / Gmail / Notion behind the existing
  `ToolAdapter` interface (web-search + GitHub exist). **Gate:** per-adapter need + auth.
- **Real execution agents** — *planned, off by default.* Stage-6 drafts exist; real
  executors are gated behind per-kind opt-in flags (`RADIAN_EXECUTOR_<KIND>`), default off.
- **Always-on background jobs** — *optional.* Set the API to Render `starter` (~$7) for
  reliable scheduled briefs/consolidation without cold-start gaps.

## Done → see `03_CHANGELOG.md`
Prototypes · Render monorepo + low-cost topology · capture/share/iOS-Shortcut link-text
path · file-upload backend (R2 + signed URLs) · PWA↔API hardening (CORS, VITE_API_URL,
401 re-mint, cold-start) · SW API-cache fix · light theme + pull-to-refresh.

> The originating directives (file-upload, Vault redesign, RADIAN 2.0, living-handoff)
> arrived as chat prompts. Their essential content is captured here + in `docs/RADIAN_2.0.md`
> and the deep docs; if a future agent needs the full directive text, recreate it under
> `docs/state/directives/` rather than relying on chat history.
