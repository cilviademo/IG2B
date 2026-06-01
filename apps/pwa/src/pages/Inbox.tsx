import { useCallback, useEffect, useMemo, useState } from "react";
import { useJson } from "@/hooks/useJson";
import {
  type Capture,
  type CaptureType,
  CAPTURE_TYPE_LABEL,
  SENSITIVITY_COLOR,
  PROCESSING_META,
} from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import {
  Inbox as InboxIcon,
  Plus,
  Download,
  Upload,
  Copy,
  Clock,
  Paperclip,
  Link2,
  StickyNote,
  Clapperboard,
  AtSign,
  Image as ImageIcon,
  Mic,
  FileText,
  MessagesSquare,
  PenLine,
  Video,
  Globe2,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import CaptureForm from "@/components/CaptureForm";
import CaptureDetail, { type DetailItem } from "@/components/CaptureDetail";
import Sheet from "@/components/Sheet";
import { listCaptures, removeCapture, subscribeCaptures, exportCaptures, importCaptures, markSynced, type LocalCapture } from "@/lib/captureStore";
import { apiEnabled, ensureSession, syncCaptureToApi, fetchCaptures, type BackendCapture } from "@/lib/api";

const TYPE_ICON: Record<CaptureType, LucideIcon> = {
  apple_note: StickyNote,
  web_link: Link2,
  instagram_reel: Clapperboard,
  threads_post: AtSign,
  screenshot: ImageIcon,
  voice_memo: Mic,
  document: FileText,
  llm_conversation: MessagesSquare,
  manual_text: PenLine,
  short_form_video: Clapperboard,
  long_form_video: Video,
  social_post: AtSign,
  web_resource: Globe2,
  note: StickyNote,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function localToDetail(c: LocalCapture): DetailItem {
  return { ...c, local: true };
}
function sampleToDetail(c: Capture): DetailItem {
  return {
    id: c.id, local: false, type: c.type, title: c.title, source: c.source,
    sensitivity: c.sensitivity, processing_status: c.processing_status,
    captured_at: c.captured_at, url: c.url ?? undefined, note: c.note,
  };
}
function backendToDetail(c: BackendCapture): DetailItem {
  return {
    id: c.id,
    local: false,
    type: c.type as CaptureType,
    title: c.title,
    source: c.source,
    sensitivity: c.sensitivity as DetailItem["sensitivity"],
    processing_status: c.processing_status as DetailItem["processing_status"],
    captured_at: c.captured_at,
    url: c.url ?? undefined,
    note: c.note,
    synced: true,
    // screenshot_ref carries the asset id for uploaded-file captures
    assetId: c.screenshot_ref ?? undefined,
  };
}

export default function Inbox() {
  // When the API is unavailable we fall back to the synthetic demo fixture so the
  // UI isn't empty in standalone/offline mode; live data replaces it when present.
  // Synthetic demo fixtures only render when the API is OFF (standalone/offline
  // preview). With a live backend, production shows real DB + local-unsynced only.
  const showFixtures = !apiEnabled();
  const { data } = useJson<{ items: Capture[] }>(showFixtures ? "/data/sample_inbox.json" : "");
  const loading = false;
  const error = null as string | null;
  const [local, setLocal] = useState<LocalCapture[]>([]);
  const [remote, setRemote] = useState<BackendCapture[] | null>(null);
  const [filter, setFilter] = useState<CaptureType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<DetailItem | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setLocal(listCaptures());
    return subscribeCaptures(() => setLocal(listCaptures()));
  }, []);

  // Live vault refresh: push unsynced local items up (re-mint-on-401 inside
  // syncCaptureToApi), then pull the authoritative DB list. Callable for the
  // manual Refresh button + auto-run on mount and when the tab regains focus.
  const refresh = useCallback(async () => {
    if (!apiEnabled()) return;
    setRefreshing(true);
    try {
      if (!(await ensureSession())) return;
      for (const c of listCaptures()) {
        if (c.synced) continue;
        if (await syncCaptureToApi(c)) markSynced(c.id);
      }
      setLocal(listCaptures());
      setRemote(await fetchCaptures());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(); // on mount
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const items: DetailItem[] = useMemo(() => {
    // Local items not yet confirmed synced (offline cache); once a capture exists
    // on the backend we show the authoritative remote copy instead.
    const unsynced = local.filter((c) => !c.synced).map(localToDetail);
    let backendOrFixture: DetailItem[];
    if (remote !== null) {
      backendOrFixture = remote.map(backendToDetail); // live DB read
    } else {
      // API not reachable yet: synced-local cache + (dev-only) demo fixtures.
      backendOrFixture = [
        ...local.filter((c) => c.synced).map(localToDetail),
        ...(showFixtures ? (data?.items ?? []).map(sampleToDetail) : []),
      ];
    }
    const all = [...unsynced, ...backendOrFixture];
    return filter === "all" ? all : all.filter((i) => i.type === filter);
  }, [local, remote, data, filter, showFixtures]);

  const presentTypes = useMemo(() => {
    const set = new Set<CaptureType>();
    local.forEach((c) => set.add(c.type));
    (data?.items ?? []).forEach((c) => set.add(c.type));
    return [...set];
  }, [local, data]);

  // Only the fixture-fallback mode depends on `data`; with a live API the queue
  // renders from `remote`/local, so never block on the (intentionally absent) fixture.
  if (showFixtures && loading) return <Loading label="Capture Inbox" />;
  if (showFixtures && (error || !data)) return <ErrorState message={error ?? "no data"} />;

  function doExport() {
    setExportText(exportCaptures());
  }
  function download(text: string) {
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "indigold_captures.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Download blocked — copy the JSON instead");
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast("Select the text and copy manually");
    }
  }
  function doImport() {
    try {
      const { added, total } = importCaptures(importText);
      toast.success(`Imported ${added} capture(s)`, { description: `${total} total local captures.` });
      setShowImport(false);
      setImportText("");
    } catch (e) {
      toast.error("Import failed", { description: e instanceof Error ? e.message : "invalid JSON" });
    }
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result));
    reader.readAsText(f);
  }

  return (
    <div className="px-5 pt-5 pb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <InboxIcon size={18} style={{ color: "oklch(0.6 0.2 264)" }} />
          <h1 className="text-xl">Universal Intake Queue</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="label-mono">{items.length} items · {local.length} local</span>
          {apiEnabled() && (
            <button onClick={() => void refresh()} aria-label="Refresh" disabled={refreshing} className="p-1 rounded-lg disabled:opacity-50" style={{ color: "oklch(0.6 0.2 264)" }}>
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>
      <p className="label-mono mb-3" style={{ color: "oklch(0.4 0.02 280)" }}>
        Share anything → Indigold auto-classifies it into RAW_CAPTURE. No questions.
      </p>

      {/* manual fallback only */}
      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold mb-2.5 border-glow"
        style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.75 0.01 280)" }}
      >
        <Plus size={16} /> Add manually (fallback)
      </button>

      {/* Export / Import */}
      <div className="flex gap-2 mb-3">
        <button onClick={doExport} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold border-glow" style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.75 0.01 280)" }}>
          <Download size={14} /> Export
        </button>
        <button onClick={() => setShowImport(true)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold border-glow" style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.75 0.01 280)" }}>
          <Upload size={14} /> Import
        </button>
      </div>

      {/* type filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" />
        {presentTypes.map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)} label={CAPTURE_TYPE_LABEL[t]} />
        ))}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <InboxIcon size={24} style={{ color: "oklch(0.4 0.02 280)" }} />
          <span className="label-mono">Nothing here yet — tap Capture</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <CaptureCard key={item.id} item={item} index={i} onOpen={() => setDetail(item)} />
          ))}
        </ul>
      )}

      <p className="label-mono mt-5" style={{ color: "oklch(0.4 0.02 280)" }}>
        Local captures persist in this browser (localStorage) and survive reload + Airplane Mode.
      </p>

      {showForm && <CaptureForm onClose={() => setShowForm(false)} onSaved={() => setShowForm(false)} />}

      {detail && (
        <CaptureDetail
          item={detail}
          onClose={() => setDetail(null)}
          onDelete={
            detail.local
              ? () => {
                  removeCapture(detail.id);
                  toast.success("Capture deleted");
                  setDetail(null);
                }
              : undefined
          }
        />
      )}

      {exportText !== null && (
        <Sheet title="Export Captures" onClose={() => setExportText(null)}>
          <p className="label-mono mb-2" style={{ color: "oklch(0.4 0.02 280)" }}>
            {local.length} local capture(s). Copy the JSON (works on iPhone Safari) or download it.
          </p>
          <textarea readOnly value={exportText} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-xl px-3 py-2.5 text-xs font-mono" style={{ background: "oklch(0.08 0.02 280)", border: "1px solid oklch(0.2 0.04 264 / 0.5)", color: "oklch(0.85 0.01 280)", minHeight: 200 }} />
          <div className="flex gap-2 mt-3">
            <button onClick={() => copy(exportText)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold" style={{ background: "oklch(0.78 0.14 85)", color: "oklch(0.16 0.04 280)" }}>
              <Copy size={15} /> Copy JSON
            </button>
            <button onClick={() => download(exportText)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold border-glow" style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.75 0.01 280)" }}>
              <Download size={15} /> Download
            </button>
          </div>
        </Sheet>
      )}

      {showImport && (
        <Sheet title="Import Captures" onClose={() => setShowImport(false)}>
          <p className="label-mono mb-2" style={{ color: "oklch(0.4 0.02 280)" }}>
            Paste capture JSON (or pick a file). Existing ids are kept; new ones are added.
          </p>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"captures":[…]}' className="w-full rounded-xl px-3 py-2.5 text-xs font-mono" style={{ background: "oklch(0.08 0.02 280)", border: "1px solid oklch(0.2 0.04 264 / 0.5)", color: "oklch(0.85 0.01 280)", minHeight: 160 }} />
          <input type="file" accept="application/json,.json" onChange={onFile} className="mt-2 text-xs" style={{ color: "oklch(0.55 0.02 280)" }} />
          <button onClick={doImport} className="w-full rounded-xl py-3 text-sm font-semibold mt-3" style={{ background: "oklch(0.78 0.14 85)", color: "oklch(0.16 0.04 280)" }}>
            Import
          </button>
        </Sheet>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="shrink-0 text-[11px] px-2.5 py-1 rounded-full font-mono" style={active ? { background: "oklch(0.45 0.22 264 / 0.2)", color: "oklch(0.6 0.2 264)" } : { background: "oklch(0.11 0.02 280)", color: "oklch(0.5 0.02 280)" }}>
      {label}
    </button>
  );
}

function CaptureCard({ item, index, onOpen }: { item: DetailItem; index: number; onOpen: () => void }) {
  const TypeIcon = TYPE_ICON[item.type];
  const sens = SENSITIVITY_COLOR[item.sensitivity];
  const proc = PROCESSING_META[item.processing_status];
  const preview = item.user_note || item.body || item.note || item.url || "";
  return (
    <li
      onClick={onOpen}
      className="rounded-2xl p-4 border-glow animate-fade-in-up cursor-pointer"
      style={{ background: "oklch(0.11 0.02 280)", animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "oklch(0.45 0.22 264 / 0.15)", color: "oklch(0.6 0.2 264)" }}>
          <TypeIcon size={11} /> {CAPTURE_TYPE_LABEL[item.type]}
        </span>
        <span className="label-mono">{item.source}</span>
        {item.domain && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: "oklch(0.72 0.15 195 / 0.16)", color: "oklch(0.72 0.15 195)" }}>{item.domain}</span>}
        {item.auto_classified && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: "oklch(0.78 0.14 85 / 0.18)", color: "oklch(0.78 0.14 85)" }}>auto</span>}
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wide" style={{ color: sens, border: `1px solid ${sens}` }}>
          {item.sensitivity}
        </span>
      </div>
      <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
      {preview && <p className="text-xs leading-relaxed mb-2 line-clamp-2" style={{ color: "oklch(0.55 0.02 280)" }}>{preview}</p>}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: proc.color }} />
        <span className="label-mono" style={{ color: proc.color }}>{proc.label}</span>
        {item.files && item.files.length > 0 && (
          <span className="label-mono flex items-center gap-0.5" style={{ color: "oklch(0.72 0.15 195)" }}>
            <Paperclip size={10} /> {item.files.length}
          </span>
        )}
        {item.synced && <span className="label-mono" style={{ color: "oklch(0.7 0.16 150)" }}>· synced</span>}
        <span className="label-mono ml-auto flex items-center gap-1" style={{ color: "oklch(0.4 0.02 280)" }}>
          <Clock size={10} /> {timeAgo(item.captured_at)}
        </span>
      </div>
    </li>
  );
}
