import { Link } from "wouter";
import { History } from "lucide-react";
import { useJson } from "@/hooks/useJson";
import type { DashboardData } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Dot } from "@/components/primitives";
import QuestsPanel from "@/components/QuestsPanel";
import ProgressionPanel from "@/components/ProgressionPanel";
import ResearchPanel from "@/components/ResearchPanel";
import SimulationPanel from "@/components/SimulationPanel";
import CompanionBrief from "@/components/CompanionBrief";
import CollapsibleSection from "@/components/CollapsibleSection";

// Styled section label used as the collapsible header title (matches the eyebrow look).
const secTitle = (text: string) => (
  <span className="cap-data" style={{ color: "var(--text-dim)", letterSpacing: "0.08em" }}>{text}</span>
);

// Each stat tile links somewhere relevant — taps lead to a real screen, not a dead cell.
const STAT_META: { key: keyof DashboardData["stats"]; label: string; href: string }[] = [
  { key: "nodes", label: "Nodes", href: "/atlas" },
  { key: "projects", label: "Projects", href: "/atlas" },
  { key: "inbox", label: "Inbox", href: "/inbox" },
  { key: "avg_mvs", label: "Avg MVS", href: "/atlas" },
  { key: "review", label: "Review", href: "/quests" },
  { key: "edges", label: "Edges", href: "/atlas" },
];

function today(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// Commander's briefing voice. Every line is read from existing dashboard data —
// no fabricated insight. "Risk signals" are derived strictly from the stat
// figures (backlog / review queue), never invented.
function riskSignals(s: DashboardData["stats"]): string[] {
  const out: string[] = [];
  if (s.inbox > 0) out.push(`${s.inbox} ${s.inbox === 1 ? "capture" : "captures"} awaiting classification in the inbox.`);
  if (s.review > 0) out.push(`${s.review} ${s.review === 1 ? "node" : "nodes"} flagged for review.`);
  if (s.avg_mvs < 45) out.push(`Average memory value is low (${s.avg_mvs}) — the vault is thinning.`);
  if (s.edges < s.nodes) out.push(`More nodes than edges — connective tissue is sparse.`);
  return out;
}

export default function Dashboard() {
  const { data, loading, error } = useJson<DashboardData>("/data/sample_dashboard.json");

  if (loading) return <Loading label="Mission Control" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  // Highest-priority directives first; numbered so it reads as a focus order.
  const focus = [...data.urgent_actions].sort((a, b) => (a.priority === "high" ? -1 : 0) - (b.priority === "high" ? -1 : 0));
  const risks = riskSignals(data.stats);
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="cap-data mt-7 mb-2" style={{ color: "var(--text-dim)", letterSpacing: "0.08em" }}>{children}</div>
  );

  return (
    <div className="px-5 pt-6 pb-6">
      {/* Eyebrow + date — the briefing header */}
      <div className="flex items-center gap-2">
        <Dot color="var(--gold)" pulse />
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Mission control</span>
        <Link href="/time-machine" className="ml-auto flex items-center gap-1" style={{ fontSize: 11, color: "var(--gold)" }}>
          <History size={12} strokeWidth={1.5} /> Time Machine
        </Link>
        <span className="cap-data font-data" style={{ color: "var(--text-dim)", letterSpacing: "0.02em" }}>{today()}</span>
      </div>

      {/* COMPANION — the spoken commander's briefing (G10) */}
      <div className="mt-4"><CompanionBrief /></div>

      {/* SITUATION — the standing brief, then a single status line from the stats */}
      <SectionLabel>Situation</SectionLabel>
      <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--text)", maxWidth: "60ch" }}>
        {data.brief}
      </p>
      <p className="mt-2 font-data" style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-dim)" }}>
        {data.stats.nodes} nodes across {data.stats.projects} projects · {data.stats.edges} links · avg MVS {data.stats.avg_mvs}.
      </p>

      {/* Stats — one hairline-ruled row, mono figures over quiet labels */}
      <div
        className="grid grid-cols-6 mt-5"
        style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}
      >
        {STAT_META.map((s, i) => (
          <Link key={s.key} href={s.href} className="tap-row py-3 px-1 text-center" style={{ borderLeft: i === 0 ? "none" : "1px solid var(--line)" }}>
            <div className="font-data" style={{ fontSize: 18, color: "var(--text)", lineHeight: 1.1 }}>{data.stats[s.key]}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{s.label}</div>
          </Link>
        ))}
      </div>

      {/* PROGRESSION — today's XP, momentum, recommended next move (G4) */}
      <ProgressionPanel />

      {/* SIMULATE — deterministic "what happens if…?" best/likely/worst (G7) */}
      <SimulationPanel />

      {/* RESEARCH HORIZON — deterministic research directions → research quests (G6) */}
      <ResearchPanel />

      {/* QUESTS — today's playable actions (active + blocked + suggested) */}
      <QuestsPanel />

      {/* DETECTIONS — surfaced insights, verbatim (no fabrication) */}
      {data.insights.length > 0 && (
        <CollapsibleSection persistKey="home_detections" title={secTitle("Detections")}>
          <ul>
            {data.insights.map((insight, i) => (
              <li
                key={i}
                className="flex items-start gap-3 py-3"
                style={{ borderBottom: i === data.insights.length - 1 ? "none" : "1px solid var(--line)" }}
              >
                <span className="mt-1.5"><Dot color="var(--info)" shape="square" /></span>
                <span style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.45 }}>{insight}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* RECOMMENDED FOCUS — urgent actions as a numbered order of march */}
      {focus.length > 0 && (
        <CollapsibleSection persistKey="home_focus" title={secTitle("Recommended focus")}>
          <ul>
            {focus.map((a, i) => (
              <li
                key={i}
                className="flex items-start gap-3 py-3"
                style={{ borderBottom: i === focus.length - 1 ? "none" : "1px solid var(--line)" }}
              >
                <span
                  className="font-data shrink-0"
                  style={{ fontSize: 13, color: a.priority === "high" ? "var(--gold)" : "var(--text-dim)", width: 16, lineHeight: 1.5 }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.45 }}>{a.text}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* RISK — derived strictly from the figures above */}
      <CollapsibleSection persistKey="home_risk" title={secTitle("Risk")}>
        {risks.length > 0 ? (
          <ul>
            {risks.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-3 py-3"
                style={{ borderBottom: i === risks.length - 1 ? "none" : "1px solid var(--line)" }}
              >
                <span className="mt-1.5"><Dot color="var(--risk)" shape="triangle" /></span>
                <span style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.45 }}>{r}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3" style={{ fontSize: 14, color: "var(--text-dim)" }}>No outstanding risk signals. Vault is stable.</p>
        )}
      </CollapsibleSection>
    </div>
  );
}
