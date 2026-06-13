import { useEffect, useMemo, useState } from "react";
import { useJson } from "@/hooks/useJson";
import { Loading, ErrorState } from "@/components/State";
import { getTimeMachine, getProgression, createQuest, apiEnabled } from "@/lib/api";
import { trackLabel, type Track } from "@/lib/progression";
import CollapsibleSection from "@/components/CollapsibleSection";
import MentorPanel from "@/components/MentorPanel";
import { TrendingUp } from "lucide-react";
import {
  timeMachine, RANGES, type RangeKey, type TimeMachineReport, type TimeMachineInput,
} from "@/lib/timeMachine";
import { History, Sparkles, GitCompare, Scale, RotateCcw, Swords, Check } from "lucide-react";

// Time Machine (G2) — a personal memory replay. Deterministic: it computes from the
// data already in the vault (nodes/edges/timeline + the live Event Store/decisions when
// the API is reachable). It never waits on a model, so it always renders something true.

const Section = ({ icon: Icon, title, pkey, children }: { icon: typeof History; title: string; pkey: string; children: React.ReactNode }) => (
  <CollapsibleSection
    persistKey={pkey}
    tint="var(--gold)"
    title={
      <span className="flex items-center gap-2">
        <Icon size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <span className="text-sm font-display" style={{ color: "var(--text)" }}>{title}</span>
      </span>
    }
  >
    {children}
  </CollapsibleSection>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-1.5" style={{ fontSize: 13, color: "var(--text-dim)" }}>{children}</p>
);

const ago = (days: number) => (days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days}d ago` : `${Math.round(days / 30)}mo ago`);

interface ProgWindow { days: number; byTrack: Record<string, number>; growing: string | null; faded: string | null; accelerated: { name: string } | null; stalled: { name: string } | null }

export default function TimeMachine() {
  const [range, setRange] = useState<RangeKey>("30d");
  const nodesRes = useJson<{ nodes: TimeMachineInput["nodes"] }>("/data/sample_nodes.json");
  const edgesRes = useJson<{ edges: TimeMachineInput["edges"] }>("/data/sample_edges.json");
  const tlRes = useJson<{ events: TimeMachineInput["timeline"] }>("/data/sample_timeline.json");
  const [live, setLive] = useState<TimeMachineReport | null>(null);
  const [triedLive, setTriedLive] = useState(false);
  const [prog, setProg] = useState<ProgWindow | null>(null);

  // Progression deltas over the selected window (deterministic; live API only).
  useEffect(() => {
    let cancelled = false;
    const days = RANGES.find((r) => r.key === range)?.days ?? 30;
    getProgression(days).then((d) => { if (!cancelled) setProg((d as { window?: ProgWindow } | null)?.window ?? null); });
    return () => { cancelled = true; };
  }, [range]);

  // Prefer the live API (real Event Store + decisions); fall back to local compute
  // over the bundled data. Either path is deterministic — no model completion needed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = (await getTimeMachine(range)) as TimeMachineReport | null;
      if (!cancelled) { setLive(r); setTriedLive(true); }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const local = useMemo<TimeMachineReport | null>(() => {
    if (!nodesRes.data || !edgesRes.data || !tlRes.data) return null;
    const input: TimeMachineInput = {
      nodes: nodesRes.data.nodes, edges: edgesRes.data.edges, timeline: tlRes.data.events,
    };
    return timeMachine(input, range);
  }, [nodesRes.data, edgesRes.data, tlRes.data, range]);

  const report = live ?? local;
  const source = live ? "live vault" : "sample vault";

  if (!triedLive && (nodesRes.loading || edgesRes.loading || tlRes.loading)) return <Loading label="Time Machine" />;
  if (!report) return <ErrorState message={nodesRes.error ?? edgesRes.error ?? tlRes.error ?? "no data"} />;

  const { replay, changes, reflection, resurfaced } = report;

  return (
    <div className="px-5 pt-6 pb-6">
      <div className="flex items-center gap-2">
        <History size={16} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">Time Machine</h1>
        <span className="cap-data ml-auto" style={{ color: "var(--text-dim)" }}>{source}</span>
      </div>
      <p className="mt-1 mb-4" style={{ fontSize: 12, color: "var(--text-dim)" }}>Replay your vault. What you were thinking, what changed, what resurfaced.</p>

      {/* Range selector — phone-first chips */}
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className="px-3 py-1.5 text-xs"
            style={{
              borderRadius: 999,
              border: `1px solid ${range === r.key ? "var(--gold-line)" : "var(--line)"}`,
              color: range === r.key ? "var(--gold)" : "var(--text-dim)",
              background: range === r.key ? "var(--surface-2)" : "transparent",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Mentor Mode (G9) — talk with past you, voiced from real history */}
      <MentorPanel rangeDays={RANGES.find((r) => r.key === range)?.days ?? 30} />

      {/* Progression over time (G4) — deterministic XP/momentum deltas for the window */}
      {prog && (
        <Section icon={TrendingUp} title="Progression over time" pkey="tm_progression">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Delta label="Strongest growing" value={prog.growing ? trackLabel(prog.growing as Track) : "—"} tone="good" />
            <Delta label="Faded track" value={prog.faded ? trackLabel(prog.faded as Track) : "—"} tone="dim" />
            <Delta label="Accelerated project" value={prog.accelerated?.name ?? "—"} tone="good" />
            <Delta label="Stalled project" value={prog.stalled?.name ?? "—"} tone="dim" />
          </div>
          {Object.keys(prog.byTrack || {}).length > 0 && (
            <div className="mt-3">
              <div className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>XP gained this window</div>
              {(Object.entries(prog.byTrack) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([t, v]) => (
                <div key={t} style={{ fontSize: 13, color: "var(--text)" }}>{trackLabel(t as Track)} <span className="cap-data" style={{ color: "var(--gold)" }}>+{v} XP</span></div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* "What was I thinking then?" */}
      <Section icon={Sparkles} title="What was I thinking then?" pkey="tm_thinking">
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--text)" }}>
          Across the {replay.window.label.toLowerCase()}, you touched{" "}
          <b style={{ color: "var(--text)" }}>{replay.counts.nodes}</b> {replay.counts.nodes === 1 ? "node" : "nodes"}
          {replay.counts.captures ? `, captured ${replay.counts.captures}` : ""}
          {replay.counts.edges ? `, and drew ${replay.counts.edges} new ${replay.counts.edges === 1 ? "link" : "links"}` : ""}.
          {replay.themes.length > 0 && <> Your attention circled around <b style={{ color: "var(--gold)" }}>{replay.themes.slice(0, 3).map((t) => t.tag).join(", ")}</b>.</>}
        </p>
        {replay.topNodes.length > 0 ? (
          <div className="mt-2">
            {replay.topNodes.map((n) => (
              <div key={n.id} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="font-data" style={{ fontSize: 12, color: "var(--gold)", width: 28 }}>{n.mvs}</span>
                <span style={{ fontSize: 14, color: "var(--text)" }}>{n.title}</span>
              </div>
            ))}
          </div>
        ) : <Empty>Quiet stretch — nothing was active in this window.</Empty>}
        {replay.highlights.length > 0 && (
          <div className="mt-3">
            {replay.highlights.map((h) => (
              <div key={h.id} className="py-1.5">
                <span className="cap-data" style={{ color: "var(--text-dim)" }}>{h.date}</span>
                <span className="ml-2" style={{ fontSize: 14, color: "var(--text-dim)" }}>{h.title}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* "What changed?" */}
      <Section icon={GitCompare} title="What changed?" pkey="tm_changed">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Change title="New themes" items={changes.newThemes} tone="good" />
          <Change title="Faded themes" items={changes.decayedThemes} tone="dim" />
          <Change title="Strengthened" items={changes.strengthenedProjects.map((p) => p.title)} tone="good" />
          <Change title="Abandoned" items={changes.abandonedThreads.map((t) => `${t.title} · ${ago(t.silentDays)}`)} tone="dim" />
        </div>
        {changes.contradictions.length > 0 && (
          <div className="mt-3">
            <div className="cap-data mb-1" style={{ color: "var(--risk)" }}>Contradictions</div>
            {changes.contradictions.map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: "var(--text-dim)" }}>{c.source} <span style={{ color: "var(--risk)" }}>{c.relationship}</span> {c.target}</div>
            ))}
          </div>
        )}
        {changes.missedFollowups.length > 0 && (
          <div className="mt-3">
            <div className="cap-data mb-1" style={{ color: "var(--gold)" }}>Missed follow-ups</div>
            {changes.missedFollowups.map((m) => (
              <div key={m.id} style={{ fontSize: 13, color: "var(--text)" }}>{m.label} <span className="cap-data" style={{ color: "var(--text-dim)" }}>· due {m.due}</span></div>
            ))}
          </div>
        )}
      </Section>

      {/* "Where was I wrong?" */}
      <Section icon={Scale} title="Where was I wrong?" pkey="tm_wrong">
        {reflection.total === 0 ? (
          <Empty>No decisions logged yet. Record decisions (with confidence + expected outcome) and they'll calibrate here over time.</Empty>
        ) : (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text)" }}>
              {reflection.resolved} of {reflection.total} decisions resolved · {reflection.hits} right, {reflection.misses} wrong.
            </p>
            <p className="mt-1" style={{ fontSize: 13, color: "var(--text-dim)" }}>{reflection.calibration.note}</p>
            {reflection.lessons.map((l) => (
              <div key={l.id} className="py-2" style={{ borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 14, color: "var(--text)" }}>{l.decision}</div>
                <div className="cap-data mt-0.5" style={{ color: l.success ? "var(--good)" : "var(--risk)" }}>
                  {Math.round(l.confidence * 100)}% confident · {l.success ? "right" : "wrong"} — {l.lesson}
                </div>
              </div>
            ))}
          </>
        )}
      </Section>

      {/* "What resurfaced?" */}
      <Section icon={RotateCcw} title="What resurfaced?" pkey="tm_resurfaced">
        {resurfaced.resurfacedThemes.length === 0 && resurfaced.forgottenGems.length === 0 ? (
          <Empty>Nothing has resurfaced from dormancy in this window.</Empty>
        ) : (
          <>
            {resurfaced.resurfacedThemes.length > 0 && (
              <p style={{ fontSize: 14, color: "var(--text)" }}>
                Returned after a quiet spell: <b style={{ color: "var(--gold)" }}>{resurfaced.resurfacedThemes.join(", ")}</b>.
              </p>
            )}
            {resurfaced.forgottenGems.length > 0 && (
              <div className="mt-2">
                <div className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>Forgotten gems (high value, gone quiet)</div>
                {resurfaced.forgottenGems.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--line)" }}>
                    <span className="font-data" style={{ fontSize: 12, color: "var(--gold)", width: 28 }}>{g.mvs}</span>
                    <span style={{ fontSize: 14, color: "var(--text)" }}>{g.title}</span>
                    <span className="cap-data" style={{ color: "var(--text-dim)" }}>{ago(g.dormantDays)}</span>
                    <CreateQuestButton title={`Revisit: ${g.title}`} summary={`Resurfaced after ${ago(g.dormantDays)}.`} nodeId={g.id} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

// "This resurfaced; create quest?" — turns a forgotten gem into a playable quest
// (deterministic backend). Quiet when the API is offline (nothing to persist to).
function CreateQuestButton({ title, summary, nodeId }: { title: string; summary: string; nodeId?: string }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!apiEnabled()) return null;
  if (done) return <span className="ml-auto flex items-center gap-1 cap-data" style={{ color: "var(--good)" }}><Check size={11} strokeWidth={1.5} /> quest</span>;
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); await createQuest({ title, summary, kind: "maintenance", source_type: "time_machine", source_id: nodeId, node_id: nodeId, state: "suggested" }); setBusy(false); setDone(true); }}
      className="ml-auto flex items-center gap-1 px-2 py-1 cap-data"
      style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)", opacity: busy ? 0.5 : 1 }}
    >
      <Swords size={11} strokeWidth={1.5} /> quest?
    </button>
  );
}

function Delta({ label, value, tone }: { label: string; value: string; tone: "good" | "dim" }) {
  return (
    <div>
      <div className="cap-data mb-0.5" style={{ color: tone === "good" ? "var(--good)" : "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 14, color: "var(--text)" }}>{value}</div>
    </div>
  );
}

function Change({ title, items, tone }: { title: string; items: string[]; tone: "good" | "dim" }) {
  return (
    <div>
      <div className="cap-data mb-1" style={{ color: tone === "good" ? "var(--good)" : "var(--text-dim)" }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)", opacity: 0.6 }}>—</div>
      ) : (
        items.slice(0, 5).map((it, i) => (
          <div key={i} style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{it}</div>
        ))
      )}
    </div>
  );
}
