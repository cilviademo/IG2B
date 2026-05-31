import { useJson } from "@/hooks/useJson";
import type { WeeklyBriefData } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import {
  Compass,
  Brain,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ChevronRight,
} from "lucide-react";

const BRIEF_IMG = "/images/weekly-brief.png";

const ACTION_DOT: Record<WeeklyBriefData["actions"][number]["priority"], string> = {
  high: "oklch(0.78 0.14 85)",
  medium: "oklch(0.6 0.2 264)",
  low: "oklch(0.55 0.02 280)",
};

export default function WeeklyBrief() {
  const { data, loading, error } = useJson<WeeklyBriefData>("/data/sample_weekly_brief.json");

  if (loading) return <Loading label="Radian Engine" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  const ke = data.knowledge_evolution;

  return (
    <div className="pb-6">
      {/* hero */}
      <div className="relative h-36 overflow-hidden">
        <img src={BRIEF_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-55" />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, oklch(0.08 0.02 280 / 0.35), oklch(0.08 0.02 280) 95%)",
          }}
        />
        <div className="absolute bottom-4 left-5">
          <div className="flex items-center gap-2 mb-1">
            <Compass size={16} style={{ color: "oklch(0.78 0.14 85)" }} />
            <span className="label-mono">Radian Engine</span>
          </div>
          <h1 className="text-xl glow-text-gold">Weekly Brief</h1>
          <span className="label-mono">{data.period}</span>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* exec summary */}
        <section className="rounded-2xl p-4 border-glow" style={{ background: "oklch(0.11 0.02 280)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Brain size={15} style={{ color: "oklch(0.6 0.2 264)" }} />
            <span className="label-mono">Executive Summary</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "oklch(0.75 0.01 280)" }}>
            {data.summary}
          </p>
        </section>

        {/* forecasts */}
        <div>
          <span className="label-mono">Strategic Forecast</span>
          <div className="space-y-3 mt-2">
            {data.forecasts.map((f, i) => {
              const isOpp = f.type === "Opportunity";
              const color = isOpp ? "oklch(0.78 0.14 85)" : "oklch(0.6 0.22 25)";
              const Icon = isOpp ? TrendingUp : AlertTriangle;
              return (
                <section
                  key={i}
                  className="rounded-2xl p-4 border-glow animate-fade-in-up"
                  style={{ background: "oklch(0.11 0.02 280)", animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon size={15} style={{ color }} />
                    <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color }}>
                      {f.type}
                    </span>
                    <span className="ml-auto font-mono text-xs" style={{ color: "oklch(0.55 0.02 280)" }}>
                      {f.confidence}%
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
                  <p className="text-xs leading-relaxed mb-2" style={{ color: "oklch(0.55 0.02 280)" }}>
                    {f.detail}
                  </p>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.18 0.02 280)" }}>
                    <div className="h-full rounded-full" style={{ width: `${f.confidence}%`, background: color }} />
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* knowledge evolution */}
        <section className="rounded-2xl p-4 border-glow" style={{ background: "oklch(0.11 0.02 280)" }}>
          <span className="label-mono">Knowledge Evolution</span>
          <div className="grid grid-cols-3 gap-2 mt-2 mb-3">
            {[
              { label: "New Nodes", value: ke.new_nodes },
              { label: "New Edges", value: ke.new_edges },
              { label: "Decay Alerts", value: ke.decay_alerts.length },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-2.5" style={{ background: "oklch(0.14 0.02 280)" }}>
                <div className="text-lg font-semibold" style={{ color: "oklch(0.92 0.01 280)" }}>
                  {s.value}
                </div>
                <div className="label-mono">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs mb-2" style={{ color: "oklch(0.55 0.02 280)" }}>
            <span style={{ color: "oklch(0.78 0.14 85)" }}>Strongest cluster:</span> {ke.strongest_cluster}
          </p>
          <p className="text-xs mb-2" style={{ color: "oklch(0.55 0.02 280)" }}>
            <span style={{ color: "oklch(0.72 0.15 195)" }}>Emerging bridge:</span> {ke.emerging_bridge}
          </p>
          <ul className="space-y-1">
            {ke.decay_alerts.map((d, i) => (
              <li key={i} className="text-xs flex items-center gap-1.5" style={{ color: "oklch(0.75 0.16 60)" }}>
                <AlertTriangle size={11} /> {d}
              </li>
            ))}
          </ul>
        </section>

        {/* boardroom synthesis */}
        <section className="rounded-2xl p-4 border-glow" style={{ background: "oklch(0.11 0.02 280)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={15} style={{ color: "oklch(0.78 0.14 85)" }} />
            <span className="label-mono">Boardroom Synthesis</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "oklch(0.75 0.01 280)" }}>
            {data.boardroom_synthesis}
          </p>
        </section>

        {/* actions */}
        <section className="rounded-2xl p-4 border-glow" style={{ background: "oklch(0.11 0.02 280)" }}>
          <span className="label-mono">Recommended Actions</span>
          <ul className="mt-2 divide-y" style={{ borderColor: "oklch(0.2 0.04 264 / 0.3)" }}>
            {data.actions.map((a, i) => (
              <li key={i} className="flex items-center gap-2.5 py-2.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACTION_DOT[a.priority] }} />
                <span className="text-sm flex-1" style={{ color: "oklch(0.75 0.01 280)" }}>
                  {a.text}
                </span>
                <ChevronRight size={15} style={{ color: "oklch(0.4 0.02 280)" }} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
