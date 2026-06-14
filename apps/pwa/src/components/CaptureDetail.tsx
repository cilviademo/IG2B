import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Trash2, Link2, Camera, FileDown, Loader2, Sparkles, Check, AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import Sheet from "./Sheet";
import CompanionPanel from "./CompanionPanel";
import { useTasks } from "@/contexts/TaskCenter";
import {
  type CaptureType,
  type Sensitivity,
  type ProcessingStatus,
  CAPTURE_TYPE_LABEL,
  SENSITIVITY_COLOR,
  PROCESSING_META,
} from "@/lib/types";
import { assetSignedUrl } from "@/lib/api";

export interface DetailItem {
  id: string;
  local: boolean;
  type: CaptureType;
  title: string;
  source: string;
  sensitivity: Sensitivity;
  processing_status: ProcessingStatus;
  captured_at: string;
  url?: string;
  body?: string;
  user_note?: string;
  note?: string;
  tags?: string[];
  domain?: string;
  media?: string;
  auto_classified?: boolean;
  files?: { name: string; type: string; size: number }[];
  synced?: boolean;
  assetId?: string; // uploaded-file asset id -> fetch a signed URL on open
  provenance?: { capture_method?: string; device?: string; app_context?: string };
}

export default function CaptureDetail({ item, onClose, onDelete }: { item: DetailItem; onClose: () => void; onDelete?: () => void }) {
  const sens = SENSITIVITY_COLOR[item.sensitivity];
  const proc = PROCESSING_META[item.processing_status];
  const body = item.body || item.note || "";
  const [companion, setCompanion] = useState(false);
  // The capture sheet reflects its OWN Ask-Radian lifecycle (running → done/failed),
  // persistently and independent of the Companion panel being open — read from the
  // Task Center by this capture's id so the state survives closing the panel.
  const { tasks, retry } = useTasks();
  const aiTask = tasks
    .filter((t) => t.subjectId === item.id && (t.kind === "companion" || t.kind === "boardroom"))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const aiBusy = aiTask && (aiTask.status === "queued" || aiTask.status === "running");
  const aiOk = aiTask && (aiTask.status === "completed" || aiTask.status === "fallback");

  // Uploaded-file assets are private; fetch a fresh, time-limited signed URL when
  // the detail opens. The URL is never stored/cached — re-minted each view, and
  // re-requested if it expires (signed links are short-lived: ~15 min default).
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const imgRetried = useRef(false);

  const loadAssetUrl = useCallback(async () => {
    if (!item.assetId) return null;
    setAssetLoading(true);
    const u = await assetSignedUrl(item.assetId);
    setAssetUrl(u);
    setAssetLoading(false);
    return u;
  }, [item.assetId]);

  useEffect(() => {
    imgRetried.current = false;
    if (item.assetId) void loadAssetUrl();
  }, [item.assetId, loadAssetUrl]);

  // If the preview image fails to load, the most likely cause is an expired
  // signed URL — re-request once before giving up.
  const onImgError = () => {
    if (imgRetried.current) return;
    imgRetried.current = true;
    void loadAssetUrl();
  };

  // Always mint a fresh URL at click time so the opened link can't be expired.
  const openFile = async (e: React.MouseEvent) => {
    e.preventDefault();
    const fresh = (await loadAssetUrl()) || assetUrl;
    if (fresh) window.open(fresh, "_blank", "noopener,noreferrer");
  };
  const isImage = /(png|jpe?g|gif|webp|heic)/i.test(item.type) || item.type === "screenshot";

  return (
    <Sheet title="Capture" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-2 py-0.5" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
            {CAPTURE_TYPE_LABEL[item.type]}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{item.source}</span>
          {item.domain && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{item.domain}{item.media ? ` · ${item.media}` : ""}</span>
          )}
          {item.auto_classified && <span className="cap-data" style={{ color: "var(--text-dim)" }}>auto</span>}
          {item.synced && (
            <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--good)" }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--good)" }} /> synced
            </span>
          )}
          <span className="ml-auto" style={{ fontSize: 11, color: sens }}>{item.sensitivity}</span>
        </div>

        <h3 className="text-base font-semibold font-display" style={{ color: "var(--text)" }}>{item.title}</h3>

        {!item.local && (
          <button
            onClick={() => setCompanion(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold"
            style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}
          >
            {aiBusy ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.5} />} Ask Radian{aiBusy ? " — working…" : ""}
          </button>
        )}

        {/* Persistent AI lifecycle for this capture (survives closing the panel). */}
        {aiTask && !item.local && (
          <div className="p-2.5" style={{ borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)" }}>
            <div className="flex items-center gap-2">
              {aiOk ? <Check size={13} strokeWidth={1.5} style={{ color: "var(--good)" }} />
                : aiTask.status === "failed" ? <AlertTriangle size={13} strokeWidth={1.5} style={{ color: "var(--risk)" }} />
                : <Loader2 size={13} strokeWidth={1.5} className="animate-spin" style={{ color: "var(--gold)" }} />}
              <span style={{ fontSize: 12.5, color: "var(--text)" }}>{aiTask.label}</span>
              <span className="cap-data ml-auto" style={{ color: aiTask.status === "failed" ? "var(--risk)" : aiOk ? "var(--good)" : "var(--text-dim)" }}>{aiTask.status}</span>
            </div>
            {aiTask.error && <p className="cap-data mt-1" style={{ color: "var(--risk)" }}>{aiTask.error}</p>}
            {aiTask.status === "fallback" && <p className="cap-data mt-1" style={{ color: "var(--gold)" }}>Live model unavailable — answered from your vault.</p>}
            <div className="flex gap-2 mt-2">
              {aiOk && aiTask.childNodeId && (
                <Link href={`/atlas?focus=${aiTask.childNodeId}`} onClick={onClose} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
                  <ExternalLink size={12} strokeWidth={1.5} /> Open result
                </Link>
              )}
              {aiTask.status === "failed" && (
                <button onClick={() => retry(aiTask.id)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                  <RotateCcw size={12} strokeWidth={1.5} /> Retry
                </button>
              )}
            </div>
          </div>
        )}

        {item.url && (
          <div className="flex items-center gap-1.5 text-xs font-mono break-all" style={{ color: "var(--info)" }}>
            <Link2 size={12} strokeWidth={1.5} className="shrink-0" /> {item.url}
          </div>
        )}

        {/* Uploaded file asset — shown via a private, time-limited signed URL */}
        {item.assetId && (
          <div className="overflow-hidden" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
            {assetLoading && (
              <div className="flex items-center gap-2 p-3" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> loading file…
              </div>
            )}
            {!assetLoading && assetUrl && isImage && (
              <img src={assetUrl} alt={item.title} onError={onImgError} className="w-full max-h-72 object-contain" style={{ background: "var(--bg)" }} />
            )}
            {!assetLoading && assetUrl && (
              <a href={assetUrl} onClick={openFile} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 p-2.5 text-xs font-semibold" style={{ background: "var(--surface-2)", color: "var(--info)" }}>
                <FileDown size={14} strokeWidth={1.5} /> Open file (fresh signed link)
              </a>
            )}
            {!assetLoading && !assetUrl && (
              <div className="p-3" style={{ fontSize: 12, color: "var(--risk)" }}>file unavailable (sign in / online required)</div>
            )}
          </div>
        )}

        {body && (
          <div>
            <div className="mb-1" style={{ fontSize: 12, color: "var(--text-dim)" }}>Body</div>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{body}</p>
          </div>
        )}

        {item.user_note && (
          <div>
            <div className="mb-1" style={{ fontSize: 12, color: "var(--text-dim)" }}>User note</div>
            <p className="text-sm" style={{ color: "var(--text)" }}>{item.user_note}</p>
          </div>
        )}

        {item.files && item.files.length > 0 && (
          <div>
            <div className="mb-1" style={{ fontSize: 12, color: "var(--text-dim)" }}>Attached files</div>
            {item.files.map((f, i) => (
              <div key={i} className="text-xs font-mono" style={{ color: "var(--text-dim)" }}>
                {f.name} · {f.type || "file"} · {Math.max(1, Math.round(f.size / 1024))} KB
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: proc.color }} />
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{proc.label}</span>
          <span className="cap-data" style={{ color: "var(--text-dim)" }}>· Layer A · {new Date(item.captured_at).toLocaleString()}</span>
        </div>

        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>{t}</span>
            ))}
          </div>
        )}

        {item.provenance && (
          <div className="flex items-center gap-1.5 cap-data" style={{ color: "var(--text-dim)" }}>
            <Camera size={11} strokeWidth={1.5} /> {item.provenance.capture_method} · {item.provenance.device} · {item.provenance.app_context}
          </div>
        )}

        {item.local && onDelete && (
          <button onClick={onDelete} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold mt-1" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--risk)" }}>
            <Trash2 size={15} strokeWidth={1.5} /> Delete capture
          </button>
        )}
      </div>
      {companion && (
        <CompanionPanel subjectType="capture" subjectId={item.id} title={item.title} onClose={() => setCompanion(false)} />
      )}
    </Sheet>
  );
}
