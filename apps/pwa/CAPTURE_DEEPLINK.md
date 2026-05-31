# Indigold — Share → Capture (zero friction)

Goal: **Share anything → Indigold → done.** No type picker, no form. The app
auto-classifies the payload (type / source / domain / media / tags) and files it
into the **Universal Intake Queue** (RAW_CAPTURE). Local-first (`localStorage`),
works offline (served from the cached app shell).

There are two entry routes:

| Route | Behavior | Use |
| :-- | :-- | :-- |
| **`/share`** | Auto-classify + **auto-save**, then show the queue. No questions. | Primary (Share Sheet / Shortcut) |
| `/capture` | Pre-fill a review form; user taps **Save**. | Optional review / manual deep link |

## `/share` (primary)
```
https://<your-pwa>.onrender.com/share?url=…&title=…&text=…&source=…&note=…
```
- `url` — the shared link (Instagram, Threads, YouTube, article, …)
- `text` — shared text / selection / note body (a bare URL here is detected too)
- `title`, `source`, `note` — optional hints
- Everything is auto-inferred; nothing is required to be chosen.

The classifier maps, e.g.: instagram.com → `instagram_reel` (content/video),
threads.net → `threads_post`, youtube/tiktok → video link, other URLs → `web_link`
(reference/article), text from Notes → `apple_note` (knowledge). Tags are derived
automatically. Sensitivity defaults to `private` for personal text, `internal` for
shared content.

## Web Share Target (Android + future iOS)
`manifest.json` declares a `share_target` pointing at `/share`, so once the PWA is
installed, **Indigold appears directly in the OS share sheet** — Share → Indigold,
no Shortcut needed.

> **iOS caveat:** Safari does not yet implement the Web Share Target API, so on
> iPhone the share sheet won't list the PWA directly. Use the Apple Shortcut below
> (it targets `/share`, so it's still zero-tap after you pick the shortcut).

## The one shortcut: "Indigold Capture" (iPhone)

Build a single accept-anything shortcut. The endpoint auto-detects platform/type
and pre-fills every field, so it's **Share → Indigold Capture → Save**.

1. **Shortcuts → +**, name it **Indigold Capture**.
2. Top dropdown → **Details**: ✓ **Show in Share Sheet**; **Accepted types = Any**
   (URLs, Text, Safari pages, Images, PDFs, …).
3. Add **Get URLs from Input** (Shortcut Input).
4. Add **URL Encode** → input the **Shortcut Input** (handles spaces/symbols).
5. Add **Text** and paste (insert the magic variables where shown):
   ```
   https://indigold-pwa.onrender.com/capture?url=[URLs]&content=[URL-Encoded Shortcut Input]&title=[Shortcut Input Name]
   ```
   - `[URLs]` = output of step 3
   - `[URL-Encoded Shortcut Input]` = output of step 4
   - `[Shortcut Input Name]` = optional (use **Get Details of Shortcut Input → Name**)
6. Add **Open URLs** → the **Text** from step 5.

Now: Instagram/TikTok/YouTube/X/Threads/Facebook/Safari/Notes → **Share → Indigold
Capture** → Indigold opens with the form already filled (type + source auto-detected
from the URL, tags generated) → tap **Save**.

**Want zero taps (no Save)?** Change the URL in step 5 from `/capture` to `/share`
— it auto-classifies and files instantly, no form.

**You only need `url` and `content`.** Everything else (type, source, title, tags,
domain) is inferred. Sending a bare `?url=` for a shared link is enough.

## Manual fallback
`/capture?type=…&title=…&url=…&body=…&source=…&note=…&tags=…` opens a pre-filled
**Confirm Capture** form for review. In the app, **Universal Intake Queue → Add
manually (fallback)** opens the same form, with **Copy Deep Link** and **Generate
Shortcut URL** test buttons.

## Files & backend sync
- The `share_target` is **POST + multipart**, so shared **images, PDFs, audio,
  video, text and documents** are accepted. The service worker captures the
  payload into IndexedDB and redirects to `/share?pending=<id>`; the app
  classifies by MIME (image→screenshot, pdf/doc→document, audio→voice_memo, …),
  stores the blob locally, and files it — no form.
- **Confidence threshold:** if auto-classification confidence is low, the
  pre-filled manual form appears as a fallback (the only time you see a form).
- **Backend sync (local-first):** when `VITE_API_URL` is set and the API is
  reachable, each capture is pushed to `/captures` (which runs the worker
  enrichment → graph → context-pack → search pipeline) using a silent per-device
  account — no login screen. Offline/asleep → stays local and re-syncs later.

## iOS reality (important)
Apple Safari does **not** implement the Web Share Target API, so on iPhone the PWA
will **not** appear in the native share sheet today (text or files). The Apple
Shortcut → `/share?...` remains the iOS bridge. The Web Share Target works on
Android / desktop installed PWAs and is ready for iOS if Apple ships support. A
true native iOS share-sheet entry needs a thin native wrapper (Capacitor/App
Store) — a later phase.

## Notes
- Instagram/Reels: only URL + note + optional caption text are stored. No scraping,
  no transcription, no video.
- Auto-classification runs **client-side** (deterministic) so it works offline with
  no backend/keys. The deeper AI enrichment → graph → context-pack → search
  pipeline is the backend stage that runs when the queue is synced to the API.
