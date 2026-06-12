import { useRef, useState } from "react";
import { toast } from "sonner";
import { Link2, Wand2, Paperclip, X } from "lucide-react";
import Sheet from "./Sheet";
import {
  type CaptureType,
  type Sensitivity,
  type ProcessingStatus,
  CAPTURE_TYPE_LABEL,
} from "@/lib/types";
import { persistCaptureFromParams, markSynced, saveCapture, type LocalCapture } from "@/lib/captureStore";
import { type CaptureParams, coerceType, buildDeepLink, buildShortcutTemplate } from "@/lib/deeplink";
import { apiEnabled, ensureSession, syncCaptureToApi, lastSyncError, uploadFileToApi, MAX_UPLOAD_BYTES } from "@/lib/api";
import { putFile, delFile } from "@/lib/idbShare";
import { enqueueUpload, dequeueUpload } from "@/lib/uploadQueue";

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

// The 8 capture types supported in test mode.
const TYPES: CaptureType[] = [
  "short_form_video",
  "long_form_video",
  "social_post",
  "web_resource",
  "note",
  "apple_note",
  "instagram_reel",
  "threads_post",
  "web_link",
  "screenshot",
  "voice_memo",
  "manual_text",
  "llm_conversation",
  "document",
];

const DEFAULT_SOURCE: Record<CaptureType, string> = {
  apple_note: "apple_notes",
  instagram_reel: "instagram",
  threads_post: "threads",
  web_link: "safari",
  screenshot: "screenshot",
  voice_memo: "voice_memos",
  manual_text: "manual",
  llm_conversation: "assistant_export",
  document: "files",
  short_form_video: "ios_share_sheet",
  long_form_video: "ios_share_sheet",
  social_post: "ios_share_sheet",
  web_resource: "ios_share_sheet",
  note: "manual",
};

const SENS: Sensitivity[] = ["public", "internal", "private", "secret"];
const PROC: ProcessingStatus[] = ["unprocessed", "queued", "processing", "processed"];

const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm";
const inputStyle = {
  background: "oklch(0.985 0.004 280)",
  border: "1px solid oklch(0.55 0.03 264 / 0.35)",
  color: "oklch(0.22 0.02 280)",
} as const;
const labelCls = "label-mono block mb-1";

export default function CaptureForm({
  onClose,
  onSaved,
  initial,
  defaultProcessing,
  prefilledLabel,
}: {
  onClose: () => void;
  onSaved: () => void;
  initial?: CaptureParams;
  defaultProcessing?: ProcessingStatus;
  prefilledLabel?: string;
}) {
  const init = initial || {};
  const initialType = coerceType(init.type);
  const [type, setType] = useState<CaptureType>(initialType);
  const [title, setTitle] = useState(init.title ?? "");
  const [url, setUrl] = useState(init.url ?? "");
  const [body, setBody] = useState(init.body ?? "");
  const [source, setSource] = useState(init.source ?? DEFAULT_SOURCE[initialType]);
  const [sourceTouched, setSourceTouched] = useState(Boolean(init.source));
  const [userNote, setUserNote] = useState(init.note ?? "");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("internal");
  const [processing, setProcessing] = useState<ProcessingStatus>(defaultProcessing ?? "unprocessed");
  const [tags, setTags] = useState(init.tags ?? "");
  const [saving, setSaving] = useState(false);
  // On-screen result of the backend sync — shown verbatim so the real status is
  // visible (no more "verified locally" guessing). e.g. "synced ✓" or "HTTP 401".
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  // Optional file attachment (binary capture -> POST /capture/upload -> R2 vault).
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const prefilled = Boolean(init.type || init.title || init.url || init.body || init.note || init.tags || init.source);

  function onTypeChange(t: CaptureType) {
    setType(t);
    if (!sourceTouched) setSource(DEFAULT_SOURCE[t]);
  }

  function currentParams(): CaptureParams {
    return { type, title, url, body, source, note: userNote, tags };
  }
  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`, { description: text.length > 64 ? text.slice(0, 64) + "…" : text });
    } catch {
      toast(label, { description: text });
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) {
      setFile(null);
      setFileErr(null);
      return;
    }
    // Client-side pre-check so we don't push a doomed >50 MB upload over cellular.
    // The server (UPLOAD_MAX_BYTES) is still the authority and returns 413 if larger.
    if (f.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setFileErr(`${f.name} is ${fmtBytes(f.size)} — over the ${MAX_UPLOAD_BYTES / 1048576 | 0} MB limit`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFileErr(null);
    setFile(f);
    if (!title.trim()) setTitle(f.name);
  }

  function clearFile() {
    setFile(null);
    setFileErr(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Upload path: persist the blob locally first (never lose it), then push the
  // bytes to the private, authenticated endpoint. On failure the file stays
  // queued in IndexedDB and the Inbox refresh retries it.
  async function saveWithFile(capture: LocalCapture, f: File) {
    const fileMeta = { name: f.name, type: f.type, size: f.size };
    const fileKey = `${capture.id}:0`;
    saveCapture({ ...capture, files: [fileMeta] });
    await putFile(fileKey, { ...fileMeta, blob: f });
    enqueueUpload({ captureId: capture.id, fileKey, filename: f.name, type: f.type, size: f.size, title: capture.title, source: capture.source, note: capture.user_note, queuedAt: Date.now() });

    if (!apiEnabled()) {
      setSaveStatus(`file saved locally + queued (API not configured)`);
      toast.success("File queued", { description: `${f.name} — will upload when online.` });
      onSaved();
      return;
    }

    setSaving(true);
    setSaveStatus(`uploading ${f.name} (${fmtBytes(f.size)})…`);
    try {
      await ensureSession();
      const res = await uploadFileToApi(f, f.name, { title: capture.title, source: capture.source, note: capture.user_note });
      markSynced(capture.id);
      dequeueUpload(capture.id);
      await delFile(fileKey);
      setSaveStatus(`uploaded ✓ ${fmtBytes(res.asset.size_bytes)} → vault (${res.asset.kind})`);
      toast.success("File uploaded", { description: `${f.name} saved to your vault.` });
      onSaved();
    } catch (e) {
      // Honest failure — the bytes are safe in IndexedDB and will retry on refresh.
      const msg = e instanceof Error ? e.message : "upload error";
      setSaveStatus(`NOT uploaded — ${msg} (file kept locally, will retry on refresh)`);
      toast.error("Upload failed", { description: "File kept locally — Indigold will retry." });
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    // A file attachment makes the file itself the capture; fall back to the
    // filename for the title so the local record always persists.
    const effectiveTitle = title.trim() || (file ? file.name : title);
    const capture = persistCaptureFromParams(
      { type, title: effectiveTitle, url, body, source: source.trim() || DEFAULT_SOURCE[type], note: userNote, tags, sensitivity, processing },
      { method: prefilled ? "deep_link" : "manual_paste", autoClassified: false },
    );
    if (!capture) {
      toast.error(file ? "Couldn't read that file — pick it again" : "Add a title, body, or URL first");
      return;
    }

    if (file) {
      await saveWithFile(capture, file);
      return;
    }

    // Saved locally first (offline-safe). Then push to the backend and SHOW the
    // real result on screen — this is the path the iOS Shortcut /capture route hits.
    if (!apiEnabled()) {
      setSaveStatus("saved locally (API not configured)");
      toast.success("Capture saved", { description: `${CAPTURE_TYPE_LABEL[type]} saved locally.` });
      onSaved();
      return;
    }

    setSaving(true);
    setSaveStatus("syncing…");
    try {
      await ensureSession();
      const ok = await syncCaptureToApi({
        type: capture.type,
        source: capture.source,
        title: capture.title,
        user_note: capture.user_note,
        body: capture.body,
        url: capture.url,
        sensitivity: capture.sensitivity,
      });
      if (ok) {
        markSynced(capture.id);
        setSaveStatus("synced ✓ (saved to database)");
        toast.success("Capture synced", { description: `${CAPTURE_TYPE_LABEL[type]} saved to your vault.` });
        onSaved();
      } else {
        // Stay on the form and show the exact failure so it can be read back.
        setSaveStatus(`NOT synced — ${lastSyncError() || "unknown error"} (kept locally)`);
        toast.error("Sync failed", { description: lastSyncError() || "kept locally" });
      }
    } catch (e) {
      setSaveStatus(`NOT synced — ${e instanceof Error ? e.message : "error"} (kept locally)`);
    } finally {
      setSaving(false);
    }
  }

  const isReel = type === "instagram_reel";

  return (
    <Sheet title={prefilled ? "Confirm Capture" : "New Capture"} onClose={onClose}>
      <div className="space-y-3">
        {prefilled && (
          <p className="label-mono" style={{ color: "oklch(0.62 0.13 85)" }}>
            {prefilledLabel ?? "Pre-filled from a deep link — review and tap Save."}
          </p>
        )}

        <div>
          <label className={labelCls}>Capture Type</label>
          <select className={inputCls} style={inputStyle} value={type} onChange={(e) => onTypeChange(e.target.value as CaptureType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {CAPTURE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Title</label>
          <input className={inputCls} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" />
        </div>

        <div>
          <label className={labelCls}>URL {isReel ? "(Reel link)" : ""}</label>
          <input className={inputCls} style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" autoCapitalize="none" />
        </div>

        <div>
          <label className={labelCls}>{isReel ? "Caption / copied text (optional)" : "Body / pasted text"}</label>
          <textarea className={inputCls} style={{ ...inputStyle, minHeight: 96, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} placeholder={isReel ? "Paste the caption if you have it — video is not scraped." : "Paste the note or text here"} />
        </div>

        <div>
          <label className={labelCls}>Source app</label>
          <input className={inputCls} style={inputStyle} value={source} onChange={(e) => { setSource(e.target.value); setSourceTouched(true); }} />
        </div>

        <div>
          <label className={labelCls}>User note (why it matters)</label>
          <textarea className={inputCls} style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} value={userNote} onChange={(e) => setUserNote(e.target.value)} placeholder="Potential idea, reference, insight…" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Sensitivity</label>
            <select className={inputCls} style={inputStyle} value={sensitivity} onChange={(e) => setSensitivity(e.target.value as Sensitivity)}>
              {SENS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Processing</label>
            <select className={inputCls} style={inputStyle} value={processing} onChange={(e) => setProcessing(e.target.value as ProcessingStatus)}>
              {PROC.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Tags (comma-separated)</label>
          <input className={inputCls} style={inputStyle} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="idea, research" autoCapitalize="none" />
        </div>

        {/* File attachment — uploaded to the private vault (R2) via /capture/upload */}
        <div>
          <label className={labelCls}>Attach file (optional)</label>
          {!file ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold border-glow"
                style={{ background: "oklch(0.965 0.006 280)", color: "oklch(0.5 0.12 195)" }}
              >
                <Paperclip size={13} /> Choose a file (image, PDF, audio…)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf,text/*,.pdf,.md,.txt,.docx,.pages,.m4a"
                onChange={onPickFile}
                className="hidden"
              />
              <p className="label-mono mt-1" style={{ color: "oklch(0.55 0.015 280)" }}>
                Stored privately · max {MAX_UPLOAD_BYTES / 1048576 | 0} MB · opens via a signed link that expires.
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={inputStyle}>
              <Paperclip size={14} style={{ color: "oklch(0.5 0.12 195)", flexShrink: 0 }} />
              <span className="text-xs font-mono break-all flex-1" style={{ color: "oklch(0.3 0.02 280)" }}>
                {file.name} · {fmtBytes(file.size)}
              </span>
              <button type="button" onClick={clearFile} aria-label="Remove file" style={{ color: "oklch(0.55 0.015 280)", flexShrink: 0 }}>
                <X size={15} />
              </button>
            </div>
          )}
          {fileErr && (
            <p className="text-xs font-mono mt-1" style={{ color: "oklch(0.58 0.18 35)" }}>{fileErr}</p>
          )}
        </div>

        {isReel && (
          <p className="label-mono" style={{ color: "oklch(0.55 0.015 280)" }}>
            Instagram: only URL + note + optional caption/screenshot text are stored. No video scraping or summarization.
          </p>
        )}

        {/* Deep-link test tools */}
        <div className="flex gap-2">
          <button onClick={() => copyText(buildDeepLink(window.location.origin, currentParams()), "Deep link")} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold border-glow" style={{ background: "oklch(0.965 0.006 280)", color: "oklch(0.5 0.12 195)" }}>
            <Link2 size={13} /> Copy Deep Link
          </button>
          <button onClick={() => copyText(buildShortcutTemplate(window.location.origin), "Shortcut URL")} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold border-glow" style={{ background: "oklch(0.965 0.006 280)", color: "oklch(0.5 0.2 264)" }}>
            <Wand2 size={13} /> Generate Shortcut URL
          </button>
        </div>

        {saveStatus && (
          <p
            className="text-xs font-mono break-words rounded-lg px-3 py-2"
            style={{
              background: "oklch(0.985 0.004 280)",
              color: saveStatus.startsWith("synced") ? "oklch(0.52 0.15 150)" : saveStatus.startsWith("NOT") ? "oklch(0.58 0.18 35)" : "oklch(0.5 0.2 264)",
            }}
          >
            sync status: {saveStatus}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl py-3 text-sm font-semibold border-glow" style={{ background: "oklch(0.965 0.006 280)", color: "oklch(0.38 0.02 280)" }}>
            Cancel
          </button>
          <button onClick={() => void save()} disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-50" style={{ background: "oklch(0.62 0.13 85)", color: "oklch(0.16 0.04 280)" }}>
            {saving ? (file ? "Uploading…" : "Saving…") : file ? "Upload File" : "Save Capture"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
