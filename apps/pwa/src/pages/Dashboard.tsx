import { useJson } from "@/hooks/useJson";
import type { DashboardData } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Dot } from "@/components/primitives";

const STAT_META: { key: keyof DashboardData["stats"]; label: string }[] = [
  { key: "nodes", label: "Nodes" },
  { key: "projects", label: "Projects" },
  { key: "inbox", label: "Inbox" },
  { key: "avg_mvs", label: "Avg MVS" },
  { key: "review", label: "Review" },
  { key: "edges", label: "Edges" },
];

function today(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function Dashboard() {
  const { data, loading, error } = useJson<DashboardData>("/data/sample_dashboard.json");

  if (loading) return <Loading label="Mission Control" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  return (
    <div className="px-5 pt-6 pb-6">
      {/* Eyebrow + date — the data is the hero, not a greeting */}
      <div className="flex items-center gap-2">
        <Dot color="var(--gold)" pulse />
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Mission control</span>
      </div>
      <div className="font-data mt-1" style={{ fontSize: 12, color: "var(--text-dim)", letterSpacing: "0.02em" }}>{today()}</div>

      {/* Daily brief as set prose, no box */}
      <p className="mt-4" style={{ fontSize: 16, lineHeight: 1.55, color: "var(--text)", maxWidth: "60ch" }}>
        {data.brief}
      </p>

      {/* Stats — one hairline-ruled row, mono figures over quiet labels */}
      <div
        className="grid grid-cols-6 mt-6"
        style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}
      >
        {STAT_META.map((s, i) => (
          <div key={s.key} className="py-3 px-1 text-center" style={{ borderLeft: i === 0 ? "none" : "1px solid var(--line)" }}>
            <div className="font-data" style={{ fontSize: 17, color: "var(--text)", lineHeight: 1.1 }}>{data.stats[s.key]}</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Urgent actions — plain rows, 6px semantic dots, hairline separators */}
      <h2 className="mt-7" style={{ fontSize: 14, color: "var(--text)" }}>Urgent actions</h2>
      <ul className="mt-1">
        {data.urgent_actions.map((a, i) => (
          <li
            key={i}
            className="flex items-start gap-3 py-3"
            style={{ borderBottom: i === data.urgent_actions.length - 1 ? "none" : "1px solid var(--line)" }}
          >
            <span className="mt-1.5">
              <Dot color={a.priority === "high" ? "var(--gold)" : "var(--text-dim)"} />
            </span>
            <span style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.45 }}>{a.text}</span>
          </li>
        ))}
      </ul>

      {/* Recent insights — same row pattern */}
      <h2 className="mt-7" style={{ fontSize: 14, color: "var(--text)" }}>Recent insights</h2>
      <ul className="mt-1">
        {data.insights.map((insight, i) => (
          <li
            key={i}
            className="flex items-start gap-3 py-3"
            style={{ borderBottom: i === data.insights.length - 1 ? "none" : "1px solid var(--line)" }}
          >
            <span className="mt-1.5">
              <Dot color="var(--info)" />
            </span>
            <span style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.45 }}>{insight}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
