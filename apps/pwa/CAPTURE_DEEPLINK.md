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

## The one shortcut: "Indigold Capture" (iPhone, iOS 17/18)

> **Why your earlier versions sent an empty payload:** the `Text` action's
> `[magic variables]` only insert a value if they're wired to the *output of a
> specific action*. If "Get URLs from Input" finds no URL (Instagram/Notes/etc.
> don't always provide one), the variable resolves to **empty** — so you got
> `?url=`. The fix is a **single `raw` field** fed by a value that's *never*
> empty, plus a **Clipboard fallback**. The endpoint now figures out everything
> from `raw`.

### Recipe (resilient: Share Sheet **and** Clipboard)

1. **Shortcuts → New Shortcut**, name it **Indigold Capture**.
2. Tap the title → **Details** (or the ⓘ/Share-Sheet icon):
   - ✓ **Show in Share Sheet**
   - **Share Sheet Types → Any** (leave all on)
   - ✓ **Allow this shortcut to access Any URL** (Privacy)
3. **If** → condition **Shortcut Input** **has any value**
   - **Otherwise** branch: add **Get Clipboard**. (This is the Clipboard fallback
     for when you opened the app without sharing, or the share gave nothing.)
   - End If. (Both branches converge on the value below.)
   - *Simpler equivalent if the If-block is fiddly:* skip step 3 and in step 4 use
     **Shortcut Input**; add a separate "Indigold (Clipboard)" shortcut that uses
     **Get Clipboard**. Two tiny shortcuts beat one brittle one.
4. Add **Text**. Set its content to the value from step 3 (the **Shortcut Input**,
   or **Clipboard** in the Otherwise branch). Do **not** type anything else — this
   Text is just the raw shared value as a string.
5. Add **URL Encode** → input = the **Text** from step 4.
6. Add **Text** again and paste **exactly** (insert the **URL Encoded** variable
   where shown — it's the only variable, and it's never empty):
   ```
   https://indigold-pwa.onrender.com/capture?raw=[URL Encoded Text]&source=ios_shortcut&method=share_sheet&device=iphone
   ```
7. Add **Open URLs** → input = the **Text** from step 6.

That's it. The single `raw` value carries whatever iOS gave (a URL, an article's
URL string, or plain text). Indigold parses `raw`, detects whether it's a link or
a note, infers the platform/type/tags, and pre-fills the form.

- **Zero-tap variant:** change `/capture` → `/share` in step 6. It auto-files into
  the Universal Intake Queue (no Save), still honoring the Clipboard fallback.
- **Clipboard-first apps (Instagram/TikTok/YouTube):** in the app, tap **Copy
  Link**, then run **Indigold Capture** — the Clipboard branch picks it up.

### Verify it's sending data
Open Indigold from the shortcut → tap **Debug Intake** (small toggle under
"Preparing your capture…"). It shows the live `location_href`, `query_params`,
`parsed_payload`, `detected_type`, `detected_source`, and `received_raw`. If
`received_raw` is empty, the Shortcut's Text/variable wiring is the culprit (re-do
steps 4–6); if it's populated, the app will pre-fill correctly.

### Accepted params
`raw` (preferred catch-all) · `url` · `content`/`text`/`body` · `title` · `type` ·
`source` · `note` · `tags` · `method` · `device`. Explicit `url` wins over `raw`;
platform is always auto-detected from the URL host (the `source` param is only a
fallback label).

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
