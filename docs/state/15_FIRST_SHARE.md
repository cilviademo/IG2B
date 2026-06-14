# First-Share Authenticity Test — pre-flight (Job 2b)

`Last updated: 2026-06-14 · Commit: phase2-prep · By: claude (Claude Code)`

> The end-to-end proof: share two real items from the phone and watch the honest pipeline.
> **Run 2a (vault wipe) first** so you're testing a genuinely empty vault. This doc tells you
> exactly what's WIRED vs ASPIRATIONAL so you're not testing fiction (no-fabrication rule).

## 2a — wipe (you run it; I can't reach Render)
1. **Export first** (data restore point): `GET /radian/export-bundle` → save the JSON. A git
   tag only restores code, not data.
2. Dry-run: `DATABASE_URL=<render-db> apps/api/node_modules/.bin/tsx scripts/reset-vault.ts`
   → review the row counts (you should see the "Test Capture (Manual)" / "Sync test" rows in
   the totals).
3. Apply: add `--apply`. Preserves `users` + `prompt_overrides`; sessions (Redis) + provider
   keys (env) untouched. Self-tested + idempotent.

> **Phase-2 self-test (2026-06-14):** ran the script end-to-end against an ephemeral Postgres
> with the real `schema.sql` loaded (22 tables). Dry-run lists **all 20 user-data tables**;
> `--apply` truncated every one to 0 while leaving `users` + `prompt_overrides` untouched; the
> scoped `--user <id> --apply` path deleted only that user's rows and preserved the others.
> **Coverage fix this pass:** the `jobs` table (worker queue — `user_id`, `payload`, `result`,
> surfaced by `/activity` + the Task Center resume-poll) was **not** in the wipe list, so a
> "reset" vault would still surface stale job results referencing deleted nodes. `jobs` is now
> wiped. With it, WIPE(20) + preserved(`users`,`prompt_overrides`) = all 22 schema tables.

## What's WIRED vs ASPIRATIONAL (honest)

| Question | Reality |
|---|---|
| **Instagram Reel URL — content fetched/enriched?** | **No reel content is fetched.** The capture stores the URL + title + your note. Ingest **classifies from that metadata only** (type/summary/MVS/entities from the URL + title + note). There is **no Instagram fetcher/transcriber** — `getTools()` has GitHub + a *stubbed* web-search; nothing pulls reel video/caption. So: URL captured + categorized honestly; the node will be thin (it only knows what the URL/title say). Don't expect summarized reel content. |
| **Apple Note — processed as real text?** | **Yes.** The Shortcut's text lands in `capture.note`; ingest synthesizes/categorizes from that actual text. A note with real content produces a real, substantive node. |
| **Auto-link between two captures?** | **Sparse by design.** Linking (`contextualize`) draws edges from shared tags/entities/project-relevance. Two unrelated items → few or zero edges. The UI shows honest "still building connections / sparse" copy and **does not invent** a link between unrelated captures. |
| **Live provider actually invoked?** | **Yes for non-secret captures.** `ingest`/`contextualize` go through `governedComplete` → live Anthropic when the key is present, EXCEPT `secret`/`internal` captures which stay on the local deterministic floor (privacy gate). Default sensitivity is `private` → uses live. Spend is visible in **Settings → API → AI usage** (and `/radian/usage`). |
| **Capture is instant?** | **Yes.** `/capture` stores + syncs immediately; AI is async (queued jobs). A slow/failed model call never blocks the capture. |

## Pre-flight checklist — what you should SEE at each step

1. **Queue (instant):** share → the item appears in **Inbox** within a second or two, marked
   synced (not stuck local/QUEUED). ✅ = synced badge. ❌ = stays "local/queued" → sync issue.
2. **Notification (Job 1 — now device-confirmed):** as ingest→contextualize run, the **bell** /
   a **toast** surfaces completion; the capture sheet shows its lifecycle. The notification spine
   is shipped + confirmed working on your device (Phase 1). ✅ = you see it progress without
   guessing. (If you ever see nothing, it's a stale Service Worker — quit-reopen ×2; cache is
   `v0.23.0`.)
3. **Node:** open the capture → a derived node exists; on **Atlas** a new node appears. The
   **Apple Note** node will be substantive; the **Reel** node will be thin (URL-only) — that's
   expected, not a bug.
4. **Atlas link:** with only two items, expect **0–1 edges**. Honest "sparse / still building
   connections" is correct; an invented link between the reel and the note would be a bug.
5. **Companion / next steps:** long-press a node → Ask anything → it routes + lands a child
   node + notifies. Situation Room convenes the six advisors on it.
6. **Budget:** Settings → API shows month-to-date spend ticked up by a few cents (live calls).

**Break vs expected sparseness:**
- *Expected:* thin reel node, few/no edges, honest "sparse" copy, a node that says it only has
  the URL.
- *A break:* capture stuck unsynced; a job stuck `queued` with no notification; an **invented**
  reel summary or a fabricated edge; a live failure shown as success (should show `fallback`/
  `failed` honestly).

Report what you actually see at each numbered step and we debug from there.
