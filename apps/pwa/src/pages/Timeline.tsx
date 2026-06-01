import { useJson } from "@/hooks/useJson";
import type { TimelineEvent } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import {
  Clock,
  Users,
  Star,
  Lightbulb,
  FolderOpen,
  Layers,
  Target,
} from "lucide-react";

const TIMELINE_IMG = "/images/timeline-header.png";

const TYPE_CONFIG: Record<TimelineEvent["type"], { icon: typeof Users; color: string }> = {
  connection: { icon: Users, color: "oklch(0.5 0.12 195)" },
  discovery: { icon: Star, color: "oklch(0.62 0.13 85)" },
  insight: { icon: Lightbulb, color: "oklch(0.6 0.15 60)" },
  project: { icon: FolderOpen, color: "oklch(0.45 0.22 264)" },
  architecture: { icon: Layers, color: "oklch(0.5 0.2 264)" },
  milestone: { icon: Target, color: "oklch(0.62 0.13 85)" },
};

const SIGNIFICANCE_DOT: Record<TimelineEvent["significance"], string> = {
  critical: "oklch(0.62 0.13 85)",
  high: "oklch(0.5 0.2 264)",
  medium: "oklch(0.46 0.02 280)",
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
    <div className="pb-6">
      <div className="relative h-32 overflow-hidden">
        <img src={TIMELINE_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, oklch(0.985 0.004 280 / 0.6), oklch(0.985 0.004 280) 95%)",
          }}
        />
        <div className="absolute bottom-3 left-5 flex items-center gap-2">
          <Clock size={16} style={{ color: "oklch(0.62 0.13 85)" }} />
          <span className="label-mono">Temporal View</span>
        </div>
      </div>

      <div className="px-5 pt-2">
        <div className="relative pl-7">
          {/* vertical line */}
          <div
            className="absolute left-[7px] top-1 bottom-1 w-px"
            style={{
              background:
                "linear-gradient(to bottom, oklch(0.45 0.22 264), oklch(0.62 0.13 85))",
            }}
          />
          {events.map((ev, i) => {
            const cfg = TYPE_CONFIG[ev.type];
            const Icon = cfg.icon;
            return (
              <div
                key={ev.id}
                className="relative mb-5 animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* node dot */}
                <span
                  className="absolute -left-[26px] top-1 w-3.5 h-3.5 rounded-full border-2"
                  style={{ background: cfg.color, borderColor: "oklch(0.985 0.004 280)" }}
                />
                <div
                  className="rounded-xl p-3.5 border-glow"
                  style={{ background: "oklch(0.965 0.006 280)" }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} style={{ color: cfg.color }} />
                    <span className="label-mono">{ev.type}</span>
                    <span
                      className="ml-auto w-1.5 h-1.5 rounded-full"
                      style={{ background: SIGNIFICANCE_DOT[ev.significance] }}
                      title={ev.significance}
                    />
                  </div>
                  <div className="label-mono mb-1" style={{ color: "oklch(0.55 0.015 280)" }}>
                    {fmtDate(ev.date)}
                  </div>
                  <h3 className="text-sm font-semibold mb-0.5">{ev.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "oklch(0.46 0.02 280)" }}>
                    {ev.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
