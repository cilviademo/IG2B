import { useJson } from "@/hooks/useJson";
import type { TimelineEvent } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Users, Star, Lightbulb, FolderOpen, Layers, Target } from "lucide-react";

const TYPE_CONFIG: Record<TimelineEvent["type"], { icon: typeof Users; color: string }> = {
  connection: { icon: Users, color: "var(--info)" },
  discovery: { icon: Star, color: "var(--gold)" },
  insight: { icon: Lightbulb, color: "var(--gold)" },
  project: { icon: FolderOpen, color: "var(--info)" },
  architecture: { icon: Layers, color: "var(--info)" },
  milestone: { icon: Target, color: "var(--gold)" },
};

const SIGNIFICANCE_DOT: Record<TimelineEvent["significance"], string> = {
  critical: "var(--gold)",
  high: "var(--info)",
  medium: "var(--text-dim)",
};

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Timeline() {
  const { data, loading, error } = useJson<{ events: TimelineEvent[] }>("/data/sample_timeline.json");

  if (loading) return <Loading label="Temporal View" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  const events = [...data.events].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="px-5 pt-6 pb-6">
      <h1 className="text-xl font-display mb-1">Timeline</h1>
      <p className="mb-5" style={{ fontSize: 12, color: "var(--text-dim)" }}>Temporal view of the vault</p>

      <div className="relative pl-7">
        {/* the spine — a single hairline does the structure */}
        <div className="absolute left-[3px] top-2 bottom-2" style={{ width: 1, background: "var(--line)" }} />
        {events.map((ev, i) => {
          const cfg = TYPE_CONFIG[ev.type];
          const Icon = cfg.icon;
          return (
            <div key={ev.id} className="relative mb-7 animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
              {/* 8px node dot on the spine */}
              <span className="absolute top-1.5" style={{ left: -27, width: 8, height: 8, borderRadius: 999, background: cfg.color }} />
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} strokeWidth={1.5} style={{ color: cfg.color }} />
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{ev.type}</span>
                <span className="cap-data ml-2" style={{ color: "var(--text-dim)" }}>{fmtDate(ev.date)}</span>
                {ev.significance === "critical" && <span className="ml-auto"><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: SIGNIFICANCE_DOT[ev.significance] }} /></span>}
              </div>
              <h3 className="font-semibold" style={{ fontSize: 16, color: "var(--text)" }}>{ev.title}</h3>
              <p className="mt-0.5" style={{ fontSize: 14, lineHeight: 1.45, color: "var(--text-dim)" }}>{ev.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
