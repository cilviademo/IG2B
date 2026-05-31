import { useEffect, useState } from "react";
import { useJson } from "@/hooks/useJson";
import type { InboxItem } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Inbox as InboxIcon, Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PRIORITY_COLOR: Record<InboxItem["priority"], string> = {
  high: "oklch(0.78 0.14 85)",
  medium: "oklch(0.72 0.15 195)",
  low: "oklch(0.55 0.02 280)",
};

const TYPE_EMOJI: Record<string, string> = {
  research: "🔬",
  article: "📰",
  reference: "🔖",
  idea: "💡",
  document: "📄",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function Inbox() {
  const { data, loading, error } = useJson<{ items: InboxItem[] }>("/data/sample_inbox.json");
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    if (data) setItems(data.items);
  }, [data]);

  if (loading) return <Loading label="Capture Inbox" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  function triage(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    toast.success("Item triaged", { description: "Processed into the knowledge graph (mock)." });
  }

  return (
    <div className="px-5 pt-5 pb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <InboxIcon size={18} style={{ color: "oklch(0.6 0.2 264)" }} />
          <h1 className="text-xl">Capture Inbox</h1>
        </div>
        <span className="label-mono">{items.length} pending</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-2">
          <CheckCircle2 size={26} style={{ color: "oklch(0.78 0.14 85)" }} />
          <span className="label-mono">Inbox clear</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li
              key={item.id}
              className="rounded-2xl p-4 border-glow animate-fade-in-up"
              style={{ background: "oklch(0.11 0.02 280)", animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wide"
                  style={{
                    color: PRIORITY_COLOR[item.priority],
                    border: `1px solid ${PRIORITY_COLOR[item.priority]}`,
                  }}
                >
                  {item.priority}
                </span>
                <span className="label-mono">{item.source}</span>
                <span className="ml-auto text-base">{TYPE_EMOJI[item.type] ?? "•"}</span>
              </div>
              <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
              <p className="text-xs leading-relaxed mb-3" style={{ color: "oklch(0.55 0.02 280)" }}>
                {item.snippet}
              </p>
              <div className="flex items-center justify-between">
                <span className="label-mono">{timeAgo(item.timestamp)}</span>
                <button
                  onClick={() => triage(item.id)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-glow"
                  style={{ background: "oklch(0.45 0.22 264 / 0.15)", color: "oklch(0.6 0.2 264)" }}
                >
                  <Check size={13} /> Triage
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
