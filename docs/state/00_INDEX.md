# Indigold — Canonical State (start here)

`Last updated: 2026-06-12 · Commit: 603527b · By: claude (Claude Code)`

This folder is the **single source of truth** for the Indigold repo. Any coding agent
(Claude Code, Codex, Cursor, Manus, future tools) **and** any human starts here. No
agent should need the owner to re-explain the project, and no agent should break
working code out of ignorance of history.

## Files (reading order)

| # | File | One-line purpose |
| :-- | :-- | :-- |
| 0 | `00_INDEX.md` (this) | Entry point + the **Agent Protocol** (below) |
| 1 | [`01_OVERVIEW.md`](01_OVERVIEW.md) | What Indigold is, architecture, deploy topology, cost |
| 2 | [`02_CURRENT_STATE.md`](02_CURRENT_STATE.md) | ✅ verified / 🔨 in-progress / ⚠️ known issues (read this every time) |
| 3 | [`03_CHANGELOG.md`](03_CHANGELOG.md) | Append-only history (reconstructed from git) |
| 4 | [`04_DECISIONS.md`](04_DECISIONS.md) | Architecture decisions + rationale (ADR-lite) |
| 5 | [`05_DEBUGGING_LOG.md`](05_DEBUGGING_LOG.md) | Bugs, root causes, fixes, and the lessons (scar tissue) |
| 6 | [`06_SECURITY.md`](06_SECURITY.md) | Secrets policy, token model, R2, privacy flag, pre-commit checklist |
| 7 | [`07_ROADMAP.md`](07_ROADMAP.md) | Forward plan + gates |
| 8 | [`08_CONSTRAINTS.md`](08_CONSTRAINTS.md) | The iron rules. **If you read only one file beyond this index, read this.** |
| 9 | [`09_VERIFICATION.md`](09_VERIFICATION.md) | How to prove work: stubs, headless, the phone re-test ritual |

**Minimum reading before any work:** `00_INDEX` → `02_CURRENT_STATE` → `08_CONSTRAINTS`
(+ any file relevant to your task area).

### Deep docs (linked, not duplicated)
- [`apps/api/UPLOADS.md`](../../apps/api/UPLOADS.md) — file-upload endpoint contract.
- [`apps/pwa/CAPTURE_DEEPLINK.md`](../../apps/pwa/CAPTURE_DEEPLINK.md) — Share→Capture + iOS Shortcut.
- [`services/radian/PRIVACY.md`](../../services/radian/PRIVACY.md) — privacy boundary (on the RADIAN branch).
- [`docs/RADIAN_2.0.md`](../RADIAN_2.0.md), [`docs/CONNECT_AN_LLM_PROVIDER.md`](../CONNECT_AN_LLM_PROVIDER.md) — RADIAN architecture + provider setup (on the RADIAN branch).
- Root [`README.md`](../../README.md) — human-facing project + run instructions.

---

## 🤖 The Agent Protocol (mandatory)

> **Before any work** — read `00_INDEX.md` → `02_CURRENT_STATE.md` → `08_CONSTRAINTS.md`,
> plus any file relevant to the task area. **Summarize back your understanding of the
> current state before changing code.** If your task conflicts with `08_CONSTRAINTS.md`
> or duplicates `07_ROADMAP.md` work, **stop and say so.**
>
> **During work** — if you find a doc/code disagreement, **code is truth**: fix the doc
> in the same session and note it in the changelog entry.
>
> **After any work (definition of done)** —
> 1. Append a `03_CHANGELOG.md` entry: date, agent, branch, commit(s), what/why, **live-test status**.
> 2. Update `02_CURRENT_STATE.md` — move items between ✅/🔨/⚠️ and **keep it SHORT** (prune stale lines).
> 3. Append `05_DEBUGGING_LOG.md` if anything was diagnosed.
> 4. Update `07_ROADMAP.md` statuses.
> 5. Refresh the `Last updated` header stamp of every file you touched.
>
> **Work without a doc update is incomplete work.**

Header stamp format (top of every file): `Last updated: <date> · Commit: <hash> · By: <agent name>`

Truth levels matter in this project: **"verified locally (headless)" ≠ "verified live by
the owner on device."** Only the owner's live confirmation promotes something to ✅ VERIFIED.
