# Current State

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

> Keep this file SHORT and ruthlessly current. Prune stale lines. Truth levels:
> **🟢 live** = owner confirmed on device · **🟡 local** = headless/stub verified only.

## ✅ VERIFIED WORKING (on `main` @ 603527b)
- 🟢 **Link/text capture sync** — iOS Shortcut → `/capture` form **Save** pushes to the API; saved to Postgres; on-screen status shows the real HTTP result.
- 🟢 **Universal Intake Queue** reads live backend captures; **Refresh button + pull-to-refresh** work (after the SW cache fix).
- 🟢 **Service worker v0.21.0** bypasses cache for ALL API traffic (the refresh fix).
- 🟢 **iOS Shortcut link/text path** (`/capture?raw=…`) — byte-for-byte stable contract.
- 🟢 **Backend round-trip** — silent per-device account auth, Postgres, and R2 storage all confirmed live.
- 🟢 **Light theme** + visible sync/refresh diagnostics.
- 🟡 **File-upload BACKEND** — `POST /capture/upload` → R2 + signed URLs exists on main (`06536a7`), plus "Copy API Token" on I/O. *No PWA file picker on main yet* (see IN PROGRESS).

## 🔨 IN PROGRESS (open PRs off `main`, NOT merged)
- **PR #1 `claude/indigold-file-upload`** — PWA file picker on `/capture`, offline IndexedDB upload queue, honest status, signed-URL re-request on expiry. *(headless 9/9, not yet live-confirmed.)*
- **PR #2 `claude/indigold-vault-redesign`** — dark-default "Vault" token system, self-hosted fonts, Atlas constellation (62fps@200), all screens; SW bumped **v0.22.0**. *(headless screenshots, not yet live-confirmed.)*
- **PR #3 `claude/radian-2.0`** — RADIAN intelligence layer Waves 0–4 + multi-provider LLM framework (Anthropic/OpenAI/Gemini/OpenRouter/Ollama), budget governor, cost ledger, prompt + Project Registry. *(108 stub checks green; deterministic until a key is set; not yet live.)*

## ⚠️ KNOWN ISSUES / doc-vs-code discrepancies
- **README §1/§5/§8 describe an older shape.** Code is truth: (a) the **default deploy is the low-cost 4-resource profile** (`render.yaml`) with worker/scheduler/radian/encompass **in-process in `indigold-api`**, not 8 separate services; (b) README §5's worker pipeline (`ingest→summarize/tag/graph`) is what runs **on main** — PR #3 replaces it with `ingest→contextualize→assist`; (c) README §8 "no external AI" is true on main, becomes provider-optional after PR #3.
- **Three PRs are unmerged** — `main` does NOT yet contain file-picker, the redesign, or RADIAN. Anything describing those as live is premature until the owner merges + live-tests.
- **"Verified locally" is not "verified live."** Most PR work is headless/stub-verified only; promote to 🟢 only after the owner's phone re-test (see `09_VERIFICATION.md`).
- **Two legacy prototypes remain in-tree** (`indigold-app/`, `Indigold_App/`) for reference; the canonical frontend is `apps/pwa`. Don't edit the legacy ones.
