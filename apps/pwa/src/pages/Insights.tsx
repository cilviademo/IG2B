import { Link } from "wouter";
import { useJson } from "@/hooks/useJson";
import type { DashboardData } from "@/lib/types";
import { Dot } from "@/components/primitives";
import ProgressionPanel from "@/components/ProgressionPanel";
import SimulationPanel from "@/components/SimulationPanel";
import ResearchPanel from "@/components/ResearchPanel";

// AURORA A1 — the secondary "Insights" surface. Everything decluttered off Home lives
// here: metrics, progression, simulate, research, and the verbatim detections. Same
// components, same deterministic data — just relocated so Home stays calm.
export default function Insights() {
  const { data } = useJson<DashboardData>("/data/sample_dashboard.json");

  return (
    <div className="px-5 pt-6 pb-12">
      <h1 className="text-xl font-display mb-1">Insights</h1>
      <p className="cap-data mb-5" style={{ color: "var(--text-dim)" }}>progress · simulations · research · signals</p>

      {/* Metrics */}
      {data && (
        <div className="grid grid-cols-3 gap-y-4 mb-2" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", paddingTop: 16, paddingBottom: 16 }}>
          {([
            ["nodes", "Nodes", "/atlas"], ["projects", "Projects", "/atlas"], ["edges", "Edges", "/atlas"],
            ["inbox", "Inbox", "/inbox"], ["avg_mvs", "Avg MVS", "/atlas"], ["review", "Review", "/quests"],
          ] as const).map(([key, label, href]) => (
            <Link key={key} href={href} className="tap-row text-center">
              <div className="font-data" style={{ fontSize: 20, color: "var(--text)", lineHeight: 1.1 }}>{data.stats[key]}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{label}</div>
            </Link>
          ))}
        </div>
      )}

      {/* Relocated panels (unchanged engines) */}
      <ProgressionPanel />
      <SimulationPanel />
      <ResearchPanel />

      {/* Detections — surfaced insights, verbatim (no fabrication) */}
      {data && data.insights.length > 0 && (
        <section className="mt-7">
          <div className="cap-data mb-2" style={{ color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Detections</div>
          <ul>
            {data.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5" style={{ borderBottom: i === data.insights.length - 1 ? "none" : "1px solid var(--line)" }}>
                <span className="mt-1.5"><Dot color="var(--info)" shape="square" /></span>
                <span style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.45 }}>{insight}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
