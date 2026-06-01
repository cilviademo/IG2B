import { useEffect, useState } from "react";
import { Trash2, Link2, Camera, FileDown, Loader2 } from "lucide-react";
import Sheet from "./Sheet";
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

  // Uploaded-file assets are private; fetch a fresh, time-limited signed URL when
  // the detail opens. The URL is never stored/cached — re-minted each view.
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (item.assetId) {
      setAssetLoading(true);
      assetSignedUrl(item.assetId)
        .then((u) => !cancelled && setAssetUrl(u))
        .finally(() => !cancelled && setAssetLoading(false));
    }
    return () => {
      cancelled = true;
    };
  }, [item.assetId]);
  const isImage = /(png|jpe?g|gif|webp|heic)/i.test(item.type) || item.type === "screenshot";

  return (
    <Sheet title="Capture" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "oklch(0.45 0.22 264 / 0.2)", color: "oklch(0.6 0.2 264)" }}>
            {CAPTURE_TYPE_LABEL[item.type]}
          </span>
          <span className="label-mono">{item.source}</span>
          {item.domain && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "oklch(0.72 0.15 195 / 0.18)", color: "oklch(0.72 0.15 195)" }}>
              {item.domain}{item.media ? ` · ${item.media}` : ""}
            </span>
          )}
          {item.auto_classified && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "oklch(0.78 0.14 85 / 0.18)", color: "oklch(0.78 0.14 85)" }}>
              auto
            </span>
          )}
          {item.synced && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "oklch(0.6 0.18 145 / 0.18)", color: "oklch(0.7 0.16 150)" }}>
              synced
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wide" style={{ color: sens, border: `1px solid ${sens}` }}>
            {item.sensitivity}
          </span>
          {item.local && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "oklch(0.78 0.14 85 / 0.18)", color: "oklch(0.78 0.14 85)" }}>
              local
            </span>
          )}
        </div>

        <h3 className="text-base font-semibold">{item.title}</h3>

        {item.url && (
          <div className="flex items-center gap-1.5 text-xs font-mono break-all" style={{ color: "oklch(0.72 0.15 195)" }}>
            <Link2 size={12} className="shrink-0" /> {item.url}
          </div>
        )}

        {/* Uploaded file asset — shown via a private, time-limited signed URL */}
        {item.assetId && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid oklch(0.2 0.04 264 / 0.5)" }}>
            {assetLoading && (
              <div className="flex items-center gap-2 p-3 label-mono">
                <Loader2 size={14} className="animate-spin" /> loading file…
              </div>
            )}
            {!assetLoading && assetUrl && isImage && (
              <img src={assetUrl} alt={item.title} className="w-full max-h-72 object-contain" style={{ background: "oklch(0.06 0.02 280)" }} />
            )}
            {!assetLoading && assetUrl && (
              <a
                href={assetUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 p-2.5 text-xs font-semibold"
                style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.72 0.15 195)" }}
              >
                <FileDown size={14} /> Open file (signed link · expires)
              </a>
            )}
            {!assetLoading && !assetUrl && (
              <div className="p-3 label-mono" style={{ color: "oklch(0.6 0.22 25)" }}>
                file unavailable (sign in / online required)
              </div>
            )}
          </div>
        )}

        {body && (
          <div>
            <div className="label-mono mb-1">Body</div>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "oklch(0.75 0.01 280)" }}>{body}</p>
          </div>
        )}

        {item.user_note && (
          <div>
            <div className="label-mono mb-1">User note</div>
            <p className="text-sm" style={{ color: "oklch(0.75 0.01 280)" }}>{item.user_note}</p>
          </div>
        )}

        {item.files && item.files.length > 0 && (
          <div>
            <div className="label-mono mb-1">Attached files</div>
            {item.files.map((f, i) => (
              <div key={i} className="text-xs font-mono" style={{ color: "oklch(0.72 0.15 195)" }}>
                {f.name} · {f.type || "file"} · {Math.max(1, Math.round(f.size / 1024))} KB
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: proc.color }} />
          <span className="label-mono" style={{ color: proc.color }}>{proc.label}</span>
          <span className="label-mono" style={{ color: "oklch(0.4 0.02 280)" }}>· Layer A · {new Date(item.captured_at).toLocaleString()}</span>
        </div>

        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "oklch(0.14 0.02 280)", color: "oklch(0.55 0.02 280)" }}>{t}</span>
            ))}
          </div>
        )}

        {item.provenance && (
          <div className="flex items-center gap-1.5 label-mono" style={{ color: "oklch(0.4 0.02 280)" }}>
            <Camera size={11} /> {item.provenance.capture_method} · {item.provenance.device} · {item.provenance.app_context}
          </div>
        )}

        {item.local && onDelete && (
          <button onClick={onDelete} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold mt-1" style={{ background: "oklch(0.6 0.22 25 / 0.15)", color: "oklch(0.7 0.2 25)" }}>
            <Trash2 size={15} /> Delete capture
          </button>
        )}
      </div>
    </Sheet>
  );
}
