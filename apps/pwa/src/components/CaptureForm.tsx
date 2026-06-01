import { useState } from "react";
import { toast } from "sonner";
import { Link2, Wand2 } from "lucide-react";
import Sheet from "./Sheet";
import {
  type CaptureType,
  type Sensitivity,
  type ProcessingStatus,
  CAPTURE_TYPE_LABEL,
} from "@/lib/types";
import { persistCaptureFromParams, markSynced } from "@/lib/captureStore";
import { type CaptureParams, coerceType, buildDeepLink, buildShortcutTemplate } from "@/lib/deeplink";
import { apiEnabled, ensureSession, syncCaptureToApi, lastSyncError } from "@/lib/api";

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

  async function save() {
    const capture = persistCaptureFromParams(
      { type, title, url, body, source: source.trim() || DEFAULT_SOURCE[type], note: userNote, tags, sensitivity, processing },
      { method: prefilled ? "deep_link" : "manual_paste", autoClassified: false },
    );
    if (!capture) {
      toast.error("Add a title, body, or URL first");
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
            {saving ? "Saving…" : "Save Capture"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
