# Indigold — Intelligence & Security Review (intake + verification)

`Last updated: 2026-06-15 · Commit: security-prompt-injection · By: claude (Claude Code)`

> **Provenance.** An external intelligence/security/open-information review was produced in a
> separate (network-isolated) Codex checkout and could not be pushed here. This document is the
> **intake on current `main`**: it records the review's proposals, **verifies the security
> findings against the live code** (Codex was on a stale checkout and explicitly marked them
> "VERIFY ON CURRENT MAIN"), and tracks remediation. The forward proposals are mirrored into
> `07_ROADMAP.md`.

## Core thesis (adopted)
Indigold should keep four **truth classes separate but linked**:
**private vault facts ≠ public-world facts ≠ model conclusions ≠ owner decisions.**
This already has primitives on `main` to build on: `truth_layer` (A/B/C), `epistemic_type`
(observation/inference/decision), `sensitivity`, the `ToolAdapter` seam, and `correlation_id`
on events. The review is a disciplined layer on top — not a rewrite.

## Security findings — verified on current `main` (2026-06-15)

### Finding A — one all-powerful bearer token (iOS Shortcut) · **VALID · severity: high · OPEN**
`requireAuth` → `readSession` yields only `{ userId, email }` (`apps/api/src/lib/session.ts`); there
is **no scope/permission field anywhere**. A valid bearer grants every authenticated route —
captures, node CRUD, `/io` export, `/radian` chat (+ external tools), signed asset URLs. The iOS
Shortcut embeds that same device token (`apps/pwa/CAPTURE_DEEPLINK.md`, `apps/api/UPLOADS.md`), so
if it leaks the blast radius is the entire vault, not just capture.
**Remediation (proposed, owner decision needed — see roadmap):** a separate **hashed, capture-only
token** (`capture:text` / `capture:file` / `capture:status`) that denies vault reads, delete,
export, account changes, Radian chat, and signed assets. **Additive only — must NOT change the
byte-for-byte `/capture?raw=…` link path (constraint #1);** the two are separable. Needs a small
schema addition (`capture_tokens`) + an issuance UI, so it's queued pending the owner's call on the
token-issuance UX.

### Finding B — external content treated as instruction (prompt injection) · **VALID · severity: medium → FIXED**
Web-search snippets, scraped pages, media transcripts, and fetched GitHub content were concatenated
into model prompts **with zero neutralization**. Mitigating fact (verified): the Anthropic adapter
(`packages/shared/src/model.ts`) is **text-generation only — no tool-use API wired** — so injected
text could *not* call delete/export/settings (blast radius was "bad/coaxed answer", not "mutated
vault"), and the privacy gate already keeps secret/internal nodes out of context. But it would
become **critical** the moment tool-use is wired, so it's fixed now.
**Fix (this PR):** `packages/shared/src/sanitize.ts` — `fenceUntrusted(label, text)` wraps external
text in a `⟦UNTRUSTED:…⟧` fence (fence glyphs + control chars stripped from the body so it can't
forge/escape the fence) and `UNTRUSTED_GUARD` is injected into the system prompt telling the model
to treat fenced content as data, never instructions. Wired into all four vectors: `/radian/chat`
web results, `ingest_capture` scraped pages, `media_synthesis` transcripts, and the `research` job's
fetched source content. `sanitize-verify` (13 checks, incl. an injected close-tag that cannot break
out). First-party vault context is intentionally **not** fenced (it's the owner's own memory).

## Forward proposals (mirrored to `07_ROADMAP.md` — owner prioritizes)
- **Evidence connector framework** (the "free/open information" strategy): a typed `ExternalEvidence`
  contract (connector, external id, canonical url, title, authors, observed/retrieved times, license,
  source kind, claim candidates, content hash, attribution) feeding the existing capture→ingest
  pipeline; **RSS/Atom first**, then Crossref, OpenAlex, Wikimedia; second tier arXiv / Europe PMC /
  Hacker News / FRED / regulatory (Federal Register, SEC EDGAR, CISA KEV, NVD). New evidence lands in
  a **Research Inbox**, never auto-promoted to graph nodes.
- **Claims layer** — an epistemic object (statement · type · subject · valid/observed time ·
  confidence · evidence · counterevidence · source kind · owner status) above memory nodes.
- **Freshness** as part of truth — `observed_at` / `valid_from` / `valid_until` / `refresh_after` /
  `source_last_modified` / `retrieved_at` / `content_hash`.
- **Contradictions / "Tensions" view** — surface owner-vs-evidence, source-vs-source, forecast-vs-
  actual, decision-vs-result, old-vs-new constraints (don't flatten disagreement).
- **Negative knowledge** — remember searched-but-not-found / unsupported / inaccessible / retracted /
  privacy-excluded / duplicate, so Radian stops re-investigating dead ends.
- **"Why did Radian show me this?"** provenance on every proactive result (trigger, ranking factors,
  freshness, source quality, privacy decision, deterministic vs model contribution).
- **PWA surfaces** — World Lens (what changed outside your vault), Evidence Drawer, Research Inbox,
  Watchlists (default weekly, not a firehose).
- **Owner intents** over brain modes — My memory / Explain / Check / Research / Decide (relabels the
  existing auto/vault/general/web/research seam).
- **Full correlation trace** — thread one `correlation_id` capture → row → event → job → connector →
  deterministic/model → claim/node/thread → PWA task, exposed in Diagnostics.

## Recommended build order
- **Phase 0 — verify newer `main` (this PR starts it):** Finding B fixed; Finding A verified + queued;
  the other reliability-gate items are already done (see `07_ROADMAP.md`).
- **Phase 1 — evidence foundation:** the `ExternalEvidence` contract + connector registry + privacy/
  quota/cache/license/provenance gates (the sanitizer shipped here is its prompt-layer half).
- **Phase 2 — first connectors:** RSS/Atom → Crossref → OpenAlex → Wikimedia.
- **Phase 3 — evidence UX:** World Lens, Evidence Drawer, Research Inbox, Watchlists, freshness +
  contradictions.
- **Phase 4 — specialized connectors** · **Phase 5 — evaluation + proactive intelligence.**
