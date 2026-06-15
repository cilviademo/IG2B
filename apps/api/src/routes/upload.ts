// POST /capture/upload  (multipart/form-data) — authenticated file capture.
// Stores the file in PRIVATE object storage, creates a capture + asset row, and
// auto-categorizes by file type. GET /assets/:id/url returns a short-lived signed
// URL. No public links are ever produced.
import { Router } from "express";
import Busboy from "busboy";
import * as repo from "@indigold/db";
import { id, enqueue } from "@indigold/shared";
import { type Authed, requireAuth, requireAuthOrCapture } from "../middleware/auth";
import {
  storageConfigured,
  assertPrivateOrThrow,
  makeKey,
  putObject,
  signedGetUrl,
} from "../lib/storage";
import { classifyFile } from "../lib/filetype";

export const uploadRouter = Router();

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 50 * 1024 * 1024); // 50 MB

// Auth is applied PER ROUTE here (the router is mounted without a blanket gate): the capture
// endpoints accept a session OR a scoped capture token; the signed-asset route is session-only,
// so a capture token can never mint asset URLs (Security review, Finding A).
uploadRouter.post("/capture/upload", requireAuthOrCapture("capture:file"), (req: Authed, res) => {
  if (!storageConfigured()) {
    return res.status(503).json({ error: "storage_not_configured" });
  }

  let fileBuf: Buffer[] = [];
  let filename = "file";
  let mime = "application/octet-stream";
  let bytes = 0;
  let tooBig = false;
  let gotFile = false;
  const fields: Record<string, string> = {};

  let bb: ReturnType<typeof Busboy>;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES } });
  } catch {
    return res.status(400).json({ error: "invalid_multipart" });
  }

  bb.on("field", (name, val) => {
    fields[name] = val;
  });
  bb.on("file", (_name, stream, info) => {
    gotFile = true;
    filename = info.filename || "file";
    mime = info.mimeType || "application/octet-stream";
    stream.on("data", (d: Buffer) => {
      bytes += d.length;
      fileBuf.push(d);
    });
    stream.on("limit", () => {
      tooBig = true;
      stream.resume();
    });
  });
  bb.on("error", () => res.status(400).json({ error: "upload_parse_error" }));
  bb.on("finish", async () => {
    if (!gotFile) return res.status(400).json({ error: "no_file" });
    if (tooBig) return res.status(413).json({ error: "file_too_large", maxBytes: MAX_BYTES });

    try {
      // Refuse to proceed if the deployment isn't private (PII safeguard).
      await assertPrivateOrThrow();

      const userId = req.userId!;
      const captureId = id("cap");
      const assetId = id("asset");
      const fc = classifyFile(mime, filename);
      const key = makeKey(userId, captureId, filename);
      const buf = Buffer.concat(fileBuf);

      await putObject(key, buf, mime);

      // Capture row (reuses the existing schema; note links to the asset).
      await repo.captures.create({
        id: captureId,
        user_id: userId,
        type: fc.type as never,
        source: fields.source || "ios_share_sheet",
        captured_at: new Date().toISOString(),
        truth_layer: "A",
        status: "inbox",
        sensitivity: "private", // uploaded files are private by default
        processing_status: "queued",
        title: fields.title || filename,
        note: fields.note || "",
        url: null,
        screenshot_ref: assetId,
        raw: { upload: { filename, mime, kind: fc.kind } },
      });

      await repo.assets.create({
        id: assetId,
        user_id: userId,
        capture_id: captureId,
        storage_key: key,
        filename,
        mime,
        size_bytes: bytes,
        visibility: "private",
        status: "stored",
      });

      await repo.audit.log({ user_id: userId, actor: "api", action: "capture.upload", target: assetId, meta: { mime, bytes } });
      // Event Store: uploaded capture is the lifecycle root (correlation = captureId).
      await repo.emitEvent({ user_id: userId, actor: "user", event_type: "capture_created", subject_type: "capture", subject_id: captureId, correlation_id: captureId, payload: { via: "upload", type: fc.type } });
      await repo.emitEvent({ user_id: userId, actor: "user", event_type: "upload_completed", subject_type: "asset", subject_id: assetId, correlation_id: captureId, payload: { mime, bytes, kind: fc.kind } });

      // Hand off to the worker pipeline like other captures.
      try {
        const job = await enqueue("ingest_capture", userId, { captureId });
        await repo.jobs.record({ id: job.id, user_id: userId, type: job.type, status: "queued", payload: job.payload });
      } catch {
        /* queue offline -> capture still stored; worker can pick up later */
      }

      const url = await signedGetUrl(key);
      res.status(201).json({
        capture: { id: captureId, type: fc.type, title: fields.title || filename, source: fields.source || "ios_share_sheet" },
        asset: { id: assetId, filename, mime, size_bytes: bytes, kind: fc.kind },
        signed_url: url, // time-limited; expires
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload_failed";
      // A "Refusing…" message means the public-write guard tripped.
      const code = msg.startsWith("Refusing") ? 500 : 502;
      console.error("[upload] failed:", msg); // full reason server-side only
      res.status(code).json({ error: "upload_failed" }); // never leak internals to the client
    }
  });

  req.pipe(bb);
});

// Scoped text capture for the iOS Shortcut (Finding A): accepts a session OR a capture:text
// token. Mirrors POST /captures' create→ingest, but a capture token can reach ONLY this.
uploadRouter.post("/capture/text", requireAuthOrCapture("capture:text"), async (req: Authed, res) => {
  const note = String(req.body?.note ?? req.body?.text ?? "").trim();
  const title = String(req.body?.title ?? "").trim() || (note ? note.slice(0, 60) : "Capture");
  const url = req.body?.url ? String(req.body.url) : null;
  if (!note && !url) return res.status(400).json({ error: "note_or_url_required" });
  const capId = id("cap");
  await repo.captures.create({
    id: capId, user_id: req.userId!, type: "manual_text", source: "ios_shortcut",
    captured_at: new Date().toISOString(), truth_layer: "A", status: "inbox",
    sensitivity: "private", processing_status: "unprocessed",
    title, note, url, screenshot_ref: null,
  });
  await repo.emitEvent({ user_id: req.userId!, actor: "user", event_type: "capture_created", subject_type: "capture", subject_id: capId, correlation_id: capId, payload: { via: "capture_text", source: "ios_shortcut" } });
  try {
    const job = await enqueue("ingest_capture", req.userId!, { captureId: capId });
    await repo.jobs.record({ id: job.id, user_id: req.userId!, type: job.type, status: "queued", payload: job.payload });
    await repo.captures.setProcessing(capId, "queued");
  } catch { /* queue offline → capture still stored; worker picks up later */ }
  res.status(201).json({ capture: { id: capId, title, type: "manual_text" } });
});

// Fresh signed URL for an asset the user owns. Never a public link. SESSION-ONLY (a capture
// token must not be able to read/sign assets).
uploadRouter.get("/assets/:id/url", requireAuth, async (req: Authed, res) => {
  if (!storageConfigured()) return res.status(503).json({ error: "storage_not_configured" });
  const a = await repo.assets.get(req.userId!, req.params.id);
  if (!a) return res.status(404).json({ error: "not_found" });
  try {
    const url = await signedGetUrl(a.storage_key);
    res.json({ url, expires_in: Number(process.env.STORAGE_SIGNED_URL_TTL || 900) });
  } catch (e) {
    console.error("[upload] sign failed:", e instanceof Error ? e.message : e);
    res.status(502).json({ error: "sign_failed" });
  }
});
