# Indigold — File / Binary Capture (Part 2)

Upload images, screenshots, PDFs, videos, `.md`/docs into the vault. Files are
stored in **private S3-compatible object storage** (Cloudflare R2 by default) and
served only via **short-lived signed URLs** — never a public link.

## Architecture
```
iOS Shortcut (file branch)  OR  Web Share Target (Android)
   → POST multipart/form-data  /capture/upload   (Bearer token required)
   → API streams bytes (busboy) → PRIVATE bucket (ACL: private)
   → creates capture (auto-categorized) + assets row (storage key, mime, size)
   → enqueues the worker pipeline
   → returns { capture, asset, signed_url (expires) }
GET /assets/:id/url → fresh signed URL (owner only)
```

- **Auth:** `requireAuth` — the device bearer token (same one used for capture
  sync). Anonymous requests get **401**. No file is reachable without a signed URL.
- **Private-by-default / PII guard** (`lib/storage.ts`):
  - `ACL: "private"` on every write.
  - `assertPrivateOrThrow()` runs at boot and before every write: refuses if
    `STORAGE_PUBLIC_BASE_URL` is set, or if the bucket grants public/AllUsers read.
  - Signed URLs expire (`STORAGE_SIGNED_URL_TTL`, default 900s).
- **Auto-categorization** (`lib/filetype.ts`): image/screenshot → Image
  (`screenshot`), pdf/doc/`.md` → Document, audio → Voice Memo, video → Short
  Video (`instagram_reel`).
- **Size limit:** `UPLOAD_MAX_BYTES` (default 50 MB) → 413 if exceeded.

## Provisioning (Cloudflare R2 — do this once)
1. Cloudflare dashboard → **R2** → **Create bucket** → name it e.g. `indigold-vault`.
   **Keep it private** (do NOT enable "Public access" / a public r2.dev domain).
2. **R2 → Manage API Tokens → Create API token** (Object Read & Write, scoped to
   that bucket). Copy the **Access Key ID** + **Secret Access Key**.
3. Your S3 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. In Render → `indigold-api` → **Environment**, set:
   ```
   STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   STORAGE_REGION=auto
   STORAGE_BUCKET=indigold-vault
   STORAGE_ACCESS_KEY_ID=<from step 2>
   STORAGE_SECRET_ACCESS_KEY=<from step 2>
   STORAGE_SIGNED_URL_TTL=900
   UPLOAD_MAX_BYTES=52428800
   ```
   Leave `STORAGE_PUBLIC_BASE_URL` **unset** (setting it trips the guard).
5. Redeploy. The API logs `[api] STORAGE GUARD: …` only if something is unsafe.

> Swap providers via env only: **AWS S3** (omit `STORAGE_ENDPOINT`, set a real
> region), **MinIO/Supabase S3** (`STORAGE_FORCE_PATH_STYLE=true`). No code change.

## iOS Shortcut — add a FILE branch (leave the link/text path untouched)
Your existing "Indigold Capture" shortcut handles links/text via `/capture`. Add a
parallel branch for files, so a shared screenshot/PDF/video POSTs its bytes:

1. After **Receive from Share Sheet** (Any), add **If** → *Shortcut Input* **has any value** of type that *is* a file. The cleanest split:
   - **Get Details of Shortcut Input → File Size** (or use **If `Shortcut Input` is `Media`/`PDF`/`File`**).
2. **File branch** (when it's a file/image/PDF/video):
   - **Get Contents of URL** with:
     - **URL:** `https://indigold-api.onrender.com/capture/upload`
     - **Method:** `POST`
     - **Headers:** `Authorization` = `Bearer <YOUR_CAPTURE_TOKEN>`
       **Recommended: use a SCOPED capture token, not your device session token.**
       Generate one in **More → Diagnostics → Capture tokens → Generate** (shown once;
       copy it into the Shortcut). A capture token can ONLY create captures — if it leaks
       it cannot read, delete, export, chat, or sign asset URLs. Revoke it anytime there.
       (The full device session token also works but grants the whole vault — avoid it.)
     - **Request Body:** **Form**
       - Add field **`file`** → type **File** → value **Shortcut Input** (the shared file)
       - (optional) field **`title`** → *Shortcut Input Name*
       - (optional) field **`source`** → `ios_share_sheet`
   - **Show Result** (optional) — confirms the 201 JSON.
3. **Else branch (links/text):** your existing **Open URLs** → `…/capture?raw=…`.

That's the only Shortcut change — the link/text path is unchanged.

## Offline behavior
- **New uploads require connectivity** (bytes must reach storage).
- Files **already captured** are kept locally (the Web Share Target path stores the
  blob in IndexedDB) and the app shell + viewer are service-worker cached, so
  previously-opened captures remain viewable offline. Signed URLs are fetched
  fresh when online (they expire by design).

## OneDrive read-only mirror (NOTE ONLY — not built)
A later, separate, **read-only** export could mirror the private bucket to a
OneDrive folder for casual browsing: a scheduled job lists new `assets`,
downloads each via the S3 client, and uploads to OneDrive via Microsoft Graph
(`PUT /me/drive/root:/Indigold/{key}:/content`) using a refresh-token flow. It
would be **one-way (bucket → OneDrive)**, never the system of record, and never
the upload target. Not implemented now due to Graph token fragility; the vault's
source of truth stays the private S3 bucket.

## Out of scope still
- Public sharing of assets (intentionally impossible here).
- Thumbnail generation server-side (the PWA shows filename + kind; image preview
  uses the signed URL).
