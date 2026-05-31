# Capture Workflow — iPhone-First (v0.1)

Indigold v0.1 validates the **capture-and-review loop**, not capture automation.
The operator captures fast on iPhone; reviews inside the PWA; processes later with
AI; and promotes only valuable information into memory.

## Architecture

```
iPhone Share Sheet
  → Apple Shortcut            (capture bridge — outside the PWA)
  → Indigold Inbox folder     (e.g. OneDrive/Indigold_Vault/00_INBOX/ — REAL vault, untouched here)
  → PWA Import / Inbox View    (review, triage, tag — this app)
  → Later AI Processing        (OCR, transcription, summarization — NOT v0.1)
  → Dashboard / Timeline / Liminal Atlas / Context Packs
```

## Role separation

| Layer | Owns | Does NOT do (in v0.1) |
| :-- | :-- | :-- |
| **Apple Shortcuts** | Capture from Share Sheet → write Markdown/TXT/JSON/media into the inbox folder | Any review, tagging, or AI |
| **Indigold PWA** | Inbox review, manual import, quick triage, category/sensitivity/project tagging, timeline/dashboard/atlas/context display, import/export | Directly read the iPhone filesystem or OneDrive; capture automation; AI |
| **AI / Processing** | OCR, transcription, summarization, tagging, entity + relationship extraction, context-pack and brief generation | Anything — **deferred to a later phase** |

The PWA must **not** assume it can directly access the full iPhone filesystem or
the OneDrive folder in v0.1. Captures enter the app via **manual Import** (and, in
this prototype, via the synthetic `sample_inbox.json` fixture).

## Supported capture types

`apple_note` · `web_link` · `instagram_reel` · `threads_post` · `screenshot` ·
`voice_memo` · `document` · `llm_conversation` · `manual_text`

Each capture is **Truth Layer A (Raw)**, `status: inbox`, and starts
`processing_status: unprocessed` (or `queued`). Sensitivity defaults to `private`
unless the Shortcut sets otherwise — `public | internal | private | secret`.

## Capture file format (what the Shortcut writes)

Markdown with YAML frontmatter. Examples live in
[`docs/sample_captures/`](./sample_captures). The PWA's `sample_inbox.json` is the
**parsed/imported** representation of these files.

```yaml
---
id: cap_20260531_apple_note_001
type: apple_note
source: apple_notes
captured_at: 2026-05-31T21:44:00
truth_layer: A
status: inbox
sensitivity: private
processing_status: unprocessed
---
# Sample Apple Note
This is fake sample content representing a captured Apple Note.
```

## Instagram / Reels limitation

Do **not** assume Reel video content can be auto-watched, scraped, transcribed, or
summarized in v0.1. For v0.1 a Reel capture stores only:

- the **URL**,
- the **user note**,
- an optional **screenshot reference**,
- `processing_status: queued` for future processing.

Future versions may explore approved APIs, metadata extraction, manual transcript
upload, screenshot analysis, or user-provided descriptions.

## What the PWA Inbox provides (v0.1)

- Capture cards with **type**, **source**, and **sensitivity** badges
- **Processing status** indicator (unprocessed / queued / processing / processed)
- **Quick triage** controls: triage out of inbox, cycle sensitivity, toggle queue
- Capture-type **filter** chips
- **Manual import / export** of the local data set (see the I/O view)

No real capture automation, no OneDrive/iCloud API, no external network processing.

## Security note

The real vault (`OneDrive/Indigold_Vault/…`) is **separate and untouched** during
prototype development. This repository contains only **synthetic** captures. The
`.gitignore` blocks any real-vault path and any secret/token patterns.
