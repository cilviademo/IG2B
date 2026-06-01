import { useJson } from "@/hooks/useJson";
import type { DashboardData } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Brain, Zap, Network, FolderKanban, Inbox, Gauge, RefreshCw, Share2 } from "lucide-react";

const HERO_IMG = "/images/hero-dashboard.png";

const STAT_META: {
  key: keyof DashboardData["stats"];
  label: string;
  icon: typeof Network;
  color: string;
}[] = [
  { key: "nodes", label: "Nodes", icon: Network, color: "oklch(0.5 0.2 264)" },
  { key: "projects", label: "Projects", icon: FolderKanban, color: "oklch(0.62 0.13 85)" },
  { key: "inbox", label: "Inbox", icon: Inbox, color: "oklch(0.5 0.12 195)" },
  { key: "avg_mvs", label: "Avg MVS", icon: Gauge, color: "oklch(0.62 0.13 85)" },
  { key: "review", label: "Review", icon: RefreshCw, color: "oklch(0.6 0.15 60)" },
  { key: "edges", label: "Edges", icon: Share2, color: "oklch(0.5 0.2 264)" },
];

export default function Dashboard() {
  const { data, loading, error } = useJson<DashboardData>("/data/sample_dashboard.json");

  if (loading) return <Loading label="Mission Control" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  return (
    <div className="pb-6">
      {/* Hero */}
      <div className="relative h-44 overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, oklch(0.985 0.004 280 / 0.5), oklch(0.985 0.004 280) 95%)",
          }}
        />
        <div className="absolute bottom-4 left-5 right-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: "oklch(0.62 0.13 85)" }} />
            <span className="label-mono">Mission Control</span>
          </div>
          <h1 className="text-2xl glow-text-gold">Good morning.</h1>
        </div>
      </div>

      <div className="px-5 -mt-1 space-y-4">
        {/* Daily Brief */}
        <section
          className="rounded-2xl p-4 border-glow animate-fade-in-up"
          style={{ background: "oklch(0.965 0.006 280)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Brain size={16} style={{ color: "oklch(0.5 0.2 264)" }} />
            <span className="label-mono">Daily Brief</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "oklch(0.38 0.02 280)" }}>
            {data.brief}
          </p>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-3 gap-2.5">
          {STAT_META.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className="rounded-xl p-3 border-glow animate-fade-in-up"
                style={{ background: "oklch(0.965 0.006 280)", animationDelay: `${i * 50}ms` }}
              >
                <Icon size={15} style={{ color: s.color }} />
                <div className="text-xl mt-1.5 font-semibold" style={{ color: "oklch(0.22 0.02 280)" }}>
                  {data.stats[s.key]}
                </div>
                <div className="label-mono">{s.label}</div>
              </div>
            );
          })}
        </section>

        {/* Urgent Actions */}
        <section
          className="rounded-2xl p-4 border-glow"
          style={{ background: "oklch(0.965 0.006 280)" }}
        >
          <span className="label-mono">Urgent Actions</span>
          <ul className="mt-2.5 space-y-2.5">
            {data.urgent_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{
                    background: a.priority === "high" ? "oklch(0.62 0.13 85)" : "oklch(0.5 0.2 264)",
                  }}
                />
                <span className="text-sm" style={{ color: "oklch(0.38 0.02 280)" }}>
                  {a.text}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Recent Insights */}
        <section
          className="rounded-2xl p-4 border-glow"
          style={{ background: "oklch(0.965 0.006 280)" }}
        >
          <span className="label-mono">Recent Insights</span>
          <ul className="mt-2.5 space-y-3">
            {data.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Zap size={14} className="mt-0.5 shrink-0" style={{ color: "oklch(0.62 0.13 85)" }} />
                <span className="text-sm" style={{ color: "oklch(0.38 0.02 280)" }}>
                  {insight}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
