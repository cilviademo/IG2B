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
import { saveCapture, newCaptureId, detectDevice, type LocalCapture } from "@/lib/captureStore";
import { type CaptureParams, coerceType, buildDeepLink, buildShortcutTemplate } from "@/lib/deeplink";
import { deriveDomainMedia } from "@/lib/classify";

// The 8 capture types supported in test mode.
const TYPES: CaptureType[] = [
  "apple_note",
  "instagram_reel",
  "threads_post",
  "web_link",
  "screenshot",
  "voice_memo",
  "manual_text",
  "llm_conversation",
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
};

const SENS: Sensitivity[] = ["public", "internal", "private", "secret"];
const PROC: ProcessingStatus[] = ["unprocessed", "queued", "processing", "processed"];

const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm";
const inputStyle = {
  background: "oklch(0.08 0.02 280)",
  border: "1px solid oklch(0.2 0.04 264 / 0.5)",
  color: "oklch(0.92 0.01 280)",
} as const;
const labelCls = "label-mono block mb-1";

export default function CaptureForm({
  onClose,
  onSaved,
  initial,
}: {
  onClose: () => void;
  onSaved: () => void;
  initial?: CaptureParams;
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
  const [processing, setProcessing] = useState<ProcessingStatus>("unprocessed");
  const [tags, setTags] = useState(init.tags ?? "");

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

  function save() {
    if (!title.trim() && !body.trim() && !url.trim()) {
      toast.error("Add a title, body, or URL first");
      return;
    }
    const capture: LocalCapture = {
      id: newCaptureId(),
      type,
      title: title.trim() || (url.trim() ? url.trim() : `${CAPTURE_TYPE_LABEL[type]} capture`),
      source: source.trim() || DEFAULT_SOURCE[type],
      url: url.trim(),
      body: body.trim(),
      user_note: userNote.trim(),
      captured_at: new Date().toISOString(),
      truth_layer: "A",
      status: "inbox",
      sensitivity,
      processing_status: processing,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      ...deriveDomainMedia(type, url.trim()),
      auto_classified: false,
      provenance: {
        capture_method: prefilled ? "deep_link" : "manual_paste",
        device: detectDevice(),
        app_context: "pwa",
      },
    };
    saveCapture(capture);
    toast.success("Capture saved", { description: `${CAPTURE_TYPE_LABEL[type]} added to your Inbox (local).` });
    onSaved();
  }

  const isReel = type === "instagram_reel";

  return (
    <Sheet title={prefilled ? "Confirm Capture" : "New Capture"} onClose={onClose}>
      <div className="space-y-3">
        {prefilled && (
          <p className="label-mono" style={{ color: "oklch(0.78 0.14 85)" }}>
            Pre-filled from a deep link — review and tap Save.
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
          <p className="label-mono" style={{ color: "oklch(0.4 0.02 280)" }}>
            Instagram: only URL + note + optional caption/screenshot text are stored. No video scraping or summarization.
          </p>
        )}

        {/* Deep-link test tools */}
        <div className="flex gap-2">
          <button onClick={() => copyText(buildDeepLink(window.location.origin, currentParams()), "Deep link")} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold border-glow" style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.72 0.15 195)" }}>
            <Link2 size={13} /> Copy Deep Link
          </button>
          <button onClick={() => copyText(buildShortcutTemplate(window.location.origin), "Shortcut URL")} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold border-glow" style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.6 0.2 264)" }}>
            <Wand2 size={13} /> Generate Shortcut URL
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl py-3 text-sm font-semibold border-glow" style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.75 0.01 280)" }}>
            Cancel
          </button>
          <button onClick={save} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ background: "oklch(0.78 0.14 85)", color: "oklch(0.16 0.04 280)" }}>
            Save Capture
          </button>
        </div>
      </div>
    </Sheet>
  );
}
