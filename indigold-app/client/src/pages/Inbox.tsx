import { useEffect, useMemo, useState } from "react";
import { useJson } from "@/hooks/useJson";
import {
  type Capture,
  type CaptureType,
  type Sensitivity,
  CAPTURE_TYPE_LABEL,
  SENSITIVITY_COLOR,
  PROCESSING_META,
  SENSITIVITY_CYCLE,
} from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import {
  Inbox as InboxIcon,
  Check,
  CheckCircle2,
  Shield,
  Clock,
  Link2,
  Camera,
  StickyNote,
  Clapperboard,
  AtSign,
  Image as ImageIcon,
  Mic,
  FileText,
  MessagesSquare,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function Inbox() {
  const { data, loading, error } = useJson<{ items: Capture[] }>("/data/sample_inbox.json");
  const [items, setItems] = useState<Capture[]>([]);
  const [filter, setFilter] = useState<CaptureType | "all">("all");

  useEffect(() => {
    if (data) setItems(data.items);
  }, [data]);

  const presentTypes = useMemo(
    () => Array.from(new Set(items.map((i) => i.type))),
    [items],
  );
  const visible = filter === "all" ? items : items.filter((i) => i.type === filter);

  if (loading) return <Loading label="Capture Inbox" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  function triage(id: string) {
    const item = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((it) => it.id !== id));
    toast.success("Triaged", {
      description: `${item ? CAPTURE_TYPE_LABEL[item.type] : "Capture"} promoted out of the inbox (mock).`,
    });
  }
  function cycleSensitivity(id: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = SENSITIVITY_CYCLE[(SENSITIVITY_CYCLE.indexOf(it.sensitivity) + 1) % SENSITIVITY_CYCLE.length];
        toast(`Sensitivity → ${next}`);
        return { ...it, sensitivity: next };
      }),
    );
  }
  function toggleQueue(id: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, processing_status: it.processing_status === "queued" ? "unprocessed" : "queued" }
          : it,
      ),
    );
  }

  return (
    <div className="px-5 pt-5 pb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <InboxIcon size={18} style={{ color: "oklch(0.6 0.2 264)" }} />
          <h1 className="text-xl">Capture Inbox</h1>
        </div>
        <span className="label-mono">{items.length} pending</span>
      </div>
      <p className="label-mono mb-3" style={{ color: "oklch(0.4 0.02 280)" }}>
        iPhone Share Sheet → Apple Shortcut → Inbox → review here
      </p>

      {/* capture-type filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" />
        {presentTypes.map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)} label={CAPTURE_TYPE_LABEL[t]} />
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <CheckCircle2 size={26} style={{ color: "oklch(0.78 0.14 85)" }} />
          <span className="label-mono">{items.length === 0 ? "Inbox clear" : "Nothing in this filter"}</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((item, i) => (
            <CaptureCard
              key={item.id}
              item={item}
              index={i}
              onTriage={() => triage(item.id)}
              onCycleSensitivity={() => cycleSensitivity(item.id)}
              onToggleQueue={() => toggleQueue(item.id)}
            />
          ))}
        </ul>
      )}

      <p className="label-mono mt-5" style={{ color: "oklch(0.4 0.02 280)" }}>
        v0.1 — quick triage is a mock. No AI processing, no OneDrive/iCloud API, no network. The real
        vault stays separate.
      </p>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 text-[11px] px-2.5 py-1 rounded-full font-mono transition-glow"
      style={
        active
          ? { background: "oklch(0.45 0.22 264 / 0.2)", color: "oklch(0.6 0.2 264)" }
          : { background: "oklch(0.11 0.02 280)", color: "oklch(0.5 0.02 280)" }
      }
    >
      {label}
    </button>
  );
}

function CaptureCard({
  item,
  index,
  onTriage,
  onCycleSensitivity,
  onToggleQueue,
}: {
  item: Capture;
  index: number;
  onTriage: () => void;
  onCycleSensitivity: () => void;
  onToggleQueue: () => void;
}) {
  const TypeIcon = TYPE_ICON[item.type];
  const sens = SENSITIVITY_COLOR[item.sensitivity];
  const proc = PROCESSING_META[item.processing_status];

  return (
    <li
      className="rounded-2xl p-4 border-glow animate-fade-in-up"
      style={{ background: "oklch(0.11 0.02 280)", animationDelay: `${index * 50}ms` }}
    >
      {/* badges */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono"
          style={{ background: "oklch(0.45 0.22 264 / 0.15)", color: "oklch(0.6 0.2 264)" }}
        >
          <TypeIcon size={11} /> {CAPTURE_TYPE_LABEL[item.type]}
        </span>
        <span className="label-mono">{item.source}</span>
        <span
          className="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wide"
          style={{ color: sens, border: `1px solid ${sens}` }}
        >
          <Shield size={10} /> {item.sensitivity}
        </span>
      </div>

      <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
      <p className="text-xs leading-relaxed mb-2" style={{ color: "oklch(0.55 0.02 280)" }}>
        {item.note}
      </p>

      {/* attachments */}
      {(item.url || item.screenshot_ref) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.url && (
            <span
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono max-w-full truncate"
              style={{ background: "oklch(0.14 0.02 280)", color: "oklch(0.55 0.02 280)" }}
            >
              <Link2 size={10} /> <span className="truncate">{item.url}</span>
            </span>
          )}
          {item.screenshot_ref && (
            <span
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono"
              style={{ background: "oklch(0.14 0.02 280)", color: "oklch(0.55 0.02 280)" }}
            >
              <Camera size={10} /> {item.screenshot_ref}
            </span>
          )}
        </div>
      )}

      {/* footer: processing + quick triage controls */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: proc.color }} />
          <span className="label-mono" style={{ color: proc.color }}>
            {proc.label}
          </span>
        </span>
        <span className="label-mono ml-1" style={{ color: "oklch(0.4 0.02 280)" }}>
          · {timeAgo(item.captured_at)}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onCycleSensitivity}
            aria-label="Cycle sensitivity"
            className="p-1.5 rounded-lg"
            style={{ background: "oklch(0.14 0.02 280)", color: sens }}
          >
            <Shield size={14} />
          </button>
          <button
            onClick={onToggleQueue}
            aria-label="Toggle processing queue"
            className="p-1.5 rounded-lg"
            style={{
              background: "oklch(0.14 0.02 280)",
              color: item.processing_status === "queued" ? "oklch(0.75 0.16 60)" : "oklch(0.5 0.02 280)",
            }}
          >
            <Clock size={14} />
          </button>
          <button
            onClick={onTriage}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-glow"
            style={{ background: "oklch(0.45 0.22 264 / 0.15)", color: "oklch(0.6 0.2 264)" }}
          >
            <Check size={13} /> Triage
          </button>
        </div>
      </div>
    </li>
  );
}
