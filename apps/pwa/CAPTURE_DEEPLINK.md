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

## Apple Shortcut recipe (iPhone, one-tap)
1. Shortcuts → **+** → **Receive** *URLs and Text* from **Share Sheet**.
2. Add **URL Encode** on the **Shortcut Input** (safety).
3. **Text**:
   ```
   https://<your-pwa>.onrender.com/share?url=[Encoded Shortcut Input]
   ```
   (For Notes/text, use `…/share?text=[Encoded Shortcut Input]` instead.)
4. **Open URLs** → the Text.
5. Settings → **Show in Share Sheet** ON. Name it "Indigold".

Now: any app → **Share → Indigold** → it's captured and classified. No form.

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
