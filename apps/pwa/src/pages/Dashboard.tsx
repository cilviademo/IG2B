import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Swords } from "lucide-react";
import { useJson } from "@/hooks/useJson";
import type { DashboardData } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Dot } from "@/components/primitives";
import QuestCard from "@/components/QuestCard";
import CompanionBrief from "@/components/CompanionBrief";
import { getQuests, apiEnabled, type Quest } from "@/lib/api";
import { questBucket } from "@/lib/quests";

// AURORA A1 — Mission Control, decluttered to FOUR sections: Companion · Today's Focus ·
// Active Quest · Risk (conditional). Progression / Simulate / Research / Detections /
// Metrics / Recommended-focus relocated to /insights (nothing removed). Whitespace and
// hierarchy over borders. Same deterministic data sources — re-presented, not rebuilt.

const eyebrow = (text: string) => (
  <div className="cap-data mb-3" style={{ color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{text}</div>
);

function riskSignals(s: DashboardData["stats"]): string[] {
  const out: string[] = [];
  if (s.inbox > 0) out.push(`${s.inbox} ${s.inbox === 1 ? "capture" : "captures"} awaiting classification.`);
  if (s.review > 0) out.push(`${s.review} ${s.review === 1 ? "node" : "nodes"} flagged for review.`);
  if (s.avg_mvs < 45) out.push(`Average memory value is low (${s.avg_mvs}) — the vault is thinning.`);
  if (s.edges < s.nodes) out.push(`More nodes than edges — connective tissue is sparse.`);
  return out;
}

// One live "active" quest (in-play first). Read from the vault; honest empty state.
function ActiveQuest() {
  const [quest, setQuest] = useState<Quest | null | undefined>(undefined);
  useEffect(() => {
    if (!apiEnabled()) { setQuest(null); return; }
    let off = false;
    getQuests().then((r) => {
      if (off) return;
      const now = Date.now();
      const items = r?.items || [];
      const active = items.find((q) => questBucket(q, now) === "active") || items.find((q) => questBucket(q, now) === "blocked");
      setQuest(active || null);
    });
    return () => { off = true; };
  }, []);

  if (quest === undefined) return <p className="pulse-soft" style={{ fontSize: 14, color: "var(--text-dim)" }}>Loading…</p>;
  if (!quest) {
    return (
      <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55 }}>
        Nothing active right now. <Link href="/quests" style={{ color: "var(--gold)" }}>Pick up a quest →</Link>
      </p>
    );
  }
  return <QuestCard quest={quest} bucket={questBucket(quest, Date.now()) || "active"} />;
}

export default function Dashboard() {
  const { data, loading, error } = useJson<DashboardData>("/data/sample_dashboard.json");
  if (loading) return <Loading label="Mission Control" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;

  const focus = [...data.urgent_actions]
    .sort((a, b) => (a.priority === "high" ? -1 : 0) - (b.priority === "high" ? -1 : 0))
    .slice(0, 3);
  const risks = riskSignals(data.stats);

  return (
    <div className="px-5 pt-6 pb-12">
      {/* COMPANION — conversational greeting + one paragraph + Brief Me (A2) */}
      <CompanionBrief paragraph={data.brief} />
      <p className="mt-3" style={{ fontSize: 17, lineHeight: 1.6, color: "var(--text)", maxWidth: "60ch" }}>
        {data.brief}
      </p>

      {/* TODAY'S FOCUS — at most three */}
      <section className="mt-9">
        {eyebrow("Today's focus")}
        {focus.length > 0 ? (
          <ul>
            {focus.map((a, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5" style={{ borderBottom: i === focus.length - 1 ? "none" : "1px solid var(--line)" }}>
                <span className="font-data shrink-0" style={{ fontSize: 13, color: a.priority === "high" ? "var(--gold)" : "var(--text-dim)", width: 14, lineHeight: 1.6 }}>{i + 1}</span>
                <span style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.5 }}>{a.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55 }}>A quiet day — nothing urgent surfaced.</p>
        )}
      </section>

      {/* ACTIVE QUEST — one card */}
      <section className="mt-9">
        <div className="flex items-center gap-2 mb-3">
          <Swords size={13} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
          <span className="cap-data" style={{ color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Active quest</span>
          <Link href="/quests" className="ml-auto cap-data" style={{ color: "var(--gold)" }}>All quests →</Link>
        </div>
        <ActiveQuest />
      </section>

      {/* RISK — only when something is actually at risk */}
      {risks.length > 0 && (
        <section className="mt-9">
          {eyebrow("Risk")}
          <ul>
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5" style={{ borderBottom: i === risks.length - 1 ? "none" : "1px solid var(--line)" }}>
                <span className="mt-1.5"><Dot color="var(--risk)" shape="triangle" /></span>
                <span style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.5 }}>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The rest lives one tap away — progression, simulations, research, signals. */}
      <Link href="/insights" className="tap-row flex items-center gap-2 mt-10 py-3" style={{ borderTop: "1px solid var(--line)", color: "var(--text-dim)", fontSize: 14 }}>
        Progress, simulations &amp; research
        <ArrowRight size={15} strokeWidth={1.5} className="ml-auto" style={{ color: "var(--gold)" }} />
      </Link>
    </div>
  );
}
