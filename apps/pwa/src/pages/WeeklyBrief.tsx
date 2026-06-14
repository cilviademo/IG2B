import { useJson } from "@/hooks/useJson";
import type { WeeklyBriefData } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { ChevronRight } from "lucide-react";
import { SectionRule } from "@/components/primitives";

const ACTION_DOT: Record<WeeklyBriefData["actions"][number]["priority"], string> = {
  high: "var(--gold)",
  medium: "var(--info)",
  low: "var(--text-dim)",
};

export default function WeeklyBrief() {
  const { data, loading, error } = useJson<WeeklyBriefData>("/data/sample_weekly_brief.json");

  if (loading) return <Loading label="Radian Engine" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  const ke = data.knowledge_evolution;

  return (
    <div className="px-5 pt-8 pb-10 page-enter">
      {/* Masthead — the magazine moment */}
      <div className="flex items-center justify-between cap-data" style={{ color: "var(--text-dim)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        <span>The Brief</span><span>{data.period}</span>
      </div>
      <h1 className="font-display" style={{ fontSize: "clamp(2rem, 9vw, 2.75rem)", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.05, marginTop: 6 }}>This week in your vault</h1>
      <hr className="rule" style={{ marginTop: 16, borderTopWidth: 2 }} />

      {/* Executive summary as the lede */}
      <p className="mt-5" style={{ fontSize: 20, lineHeight: 1.62, color: "var(--text)", maxWidth: "62ch", fontWeight: 450 }}>{data.summary}</p>

      {/* Forecasts — big mono figure right-aligned, dot+label, 2px hairline meter */}
      <div className="mt-10"><SectionRule label="Strategic forecast" /></div>
      {data.forecasts.map((f, i) => {
        const isOpp = f.type === "Opportunity";
        const color = isOpp ? "var(--good)" : "var(--risk)";
        return (
          <div key={i} className="mt-5 animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: color }} />
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{f.type}</span>
                </div>
                <h3 className="font-display" style={{ fontSize: 19, lineHeight: 1.2, color: "var(--text)" }}>{f.title}</h3>
              </div>
              <div className="font-data" style={{ fontSize: 30, lineHeight: 1, color: "var(--text)" }}>{f.confidence}</div>
            </div>
            <p className="mt-1.5 mb-2" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-dim)" }}>{f.detail}</p>
            <div style={{ height: 2, background: "var(--line)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${f.confidence}%`, background: color }} />
            </div>
          </div>
        );
      })}

      {/* Knowledge evolution — hairline-ruled stat row + prose */}
      <div className="mt-10"><SectionRule label="Knowledge evolution" /></div>
      <div className="grid grid-cols-3 mt-3" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        {[
          { label: "New nodes", value: ke.new_nodes },
          { label: "New edges", value: ke.new_edges },
          { label: "Decay alerts", value: ke.decay_alerts.length },
        ].map((s, i) => (
          <div key={s.label} className="py-3 px-1 text-center" style={{ borderLeft: i === 0 ? "none" : "1px solid var(--line)" }}>
            <div className="font-data" style={{ fontSize: 18, color: "var(--text)" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3" style={{ fontSize: 14, color: "var(--text-dim)" }}>
        <span style={{ color: "var(--text)" }}>Strongest cluster:</span> {ke.strongest_cluster}
      </p>
      <p className="mt-1.5" style={{ fontSize: 14, color: "var(--text-dim)" }}>
        <span style={{ color: "var(--text)" }}>Emerging bridge:</span> {ke.emerging_bridge}
      </p>
      <ul className="mt-2">
        {ke.decay_alerts.map((d, i) => (
          <li key={i} className="flex items-center gap-2 py-1" style={{ fontSize: 13, color: "var(--text-dim)" }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--gold)", flexShrink: 0 }} /> {d}
          </li>
        ))}
      </ul>

      {/* Boardroom synthesis — prose */}
      <div className="mt-10"><SectionRule label="Boardroom synthesis" /></div>
      <p className="mt-3" style={{ fontSize: 16, lineHeight: 1.55, color: "var(--text)", maxWidth: "60ch" }}>{data.boardroom_synthesis}</p>

      {/* Recommended actions — plain rows, semantic dots, hairline separators */}
      <div className="mt-10"><SectionRule label="Recommended actions" /></div>
      <ul className="mt-1">
        {data.actions.map((a, i) => (
          <li key={i} className="flex items-center gap-3 py-3" style={{ borderBottom: i === data.actions.length - 1 ? "none" : "1px solid var(--line)" }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: ACTION_DOT[a.priority], flexShrink: 0 }} />
            <span className="flex-1" style={{ fontSize: 14, color: "var(--text)" }}>{a.text}</span>
            <ChevronRight size={15} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
