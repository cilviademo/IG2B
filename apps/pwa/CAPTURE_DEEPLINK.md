# Indigold — `/capture` Deep Link (Apple Shortcuts / Share Sheet)

Open the PWA pre-filled and one-tap save. Local-first (saves to `localStorage`),
works offline (served from the cached app shell).

## URL format
```
https://<your-pwa>.onrender.com/capture?type=…&title=…&url=…&body=…&source=…&note=…&tags=…
```
All params are optional and URL-encoded.

| Param | Meaning |
| :-- | :-- |
| `type` | one of: apple_note, instagram_reel, threads_post, web_link, screenshot, voice_memo, manual_text, llm_conversation (defaults to manual_text) |
| `title` | short title |
| `url` | link (e.g. the Reel/Threads/web URL) |
| `body` | pasted text / caption |
| `source` | source app label |
| `note` | user note ("why it matters") |
| `tags` | comma-separated tags |

**Example**
```
https://indigold-pwa.onrender.com/capture?type=instagram_reel&title=Example&url=https://instagram.com/reel/123&note=Aesthetic%20reference&tags=idea,reference
```

Behavior: opens the **Confirm Capture** form pre-filled → you review → tap **Save**
→ it lands in the Inbox (marked `local`, provenance `capture_method: deep_link`).

## Build links inside the app
In **Inbox → + Capture**, two test buttons:
- **Copy Deep Link** — a working link from the current form values.
- **Generate Shortcut URL** — an Apple Shortcuts template with `[Bracketed]` tokens
  to replace with magic variables.

## Apple Shortcut recipe (Share Sheet)
1. Shortcuts app → **+** → **Add Action** → **Receive** *URLs / Text* from **Share Sheet**.
2. (Optional) **Ask for Input** → Text → prompt "Note".
3. **Text** action — paste, replacing the bracket tokens with variables:
   ```
   https://<your-pwa>.onrender.com/capture?type=web_link&url=[Shortcut Input]&note=[Provided Input]
   ```
   Use the **URL Encode** action on the Shortcut Input first for safety.
4. **Open URLs** action → the Text above.
5. Shortcut Settings → **Show in Share Sheet** ON.

Now: Safari/Instagram/Threads → **Share → your shortcut** → Indigold opens
pre-filled → tap **Save**. (Add the PWA to your Home Screen first so it opens
standalone.)

## Notes
- Instagram/Reels: only URL + note + optional caption text are stored. No scraping,
  no transcription, no video.
- No backend, login, or external calls are involved in the capture path.
