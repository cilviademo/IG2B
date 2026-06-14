import { useEffect, useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { runWhatIf, getProgression, apiEnabled, type SimulationResult, type SimOutcome } from "@/lib/api";
import CollapsibleSection, { useCollapsed } from "./CollapsibleSection";
import { useTaskAction } from "@/contexts/TaskCenter";

// Mission Control — Simulation Engine (G7). "What happens if…?" → best / likely / worst
// with probability ESTIMATES (deterministic, computed from your graph signals; never a
// prediction). Comparisons ("A vs B") score each option against its matching project.
const BAND_COLOR: Record<string, string> = { best: "var(--good)", likely: "var(--gold)", worst: "var(--risk)" };
const BAND_LABEL: Record<string, string> = { best: "Best case", likely: "Likely", worst: "Worst case" };

function OutcomeRow({ o }: { o: SimOutcome }) {
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setW(o.probability)); return () => cancelAnimationFrame(id); }, [o.probability]);
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: BAND_COLOR[o.band] }} />
        <span style={{ fontSize: 13, color: "var(--text)" }}>{BAND_LABEL[o.band]}</span>
        <span className="cap-data ml-auto" style={{ color: BAND_COLOR[o.band] }}>{o.probability}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full bar-fill" style={{ width: `${w}%`, background: BAND_COLOR[o.band] }} />
      </div>
      <p className="mt-1 cap-data" style={{ color: "var(--text-dim)" }}>{o.summary}</p>
    </div>
  );
}

export default function SimulationPanel() {
  const [q, setQ] = useState("");
  const [hide, setHide] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  // Runs in the background via the Task Center (notifies on Home when ready).
  const { start, busy, result: taskResult } = useTaskAction<{ result: SimulationResult; node: string } | null>("simulate", "/");
  const result = hide ? null : (taskResult?.result ?? null);
  const { open, toggle } = useCollapsed("home_simulate", false);

  // Lazy: the scenario chips need /radian/progression — fetch only when expanded.
  useEffect(() => {
    if (!open || chips.length) return;
    getProgression().then((d) => {
      const projects = (d as { projects?: { name: string }[] } | null)?.projects ?? [];
      const names = projects.slice(0, 3).map((p) => p.name);
      const c: string[] = [];
      if (names[0]) c.push(`If I focus ${names[0]}?`);
      if (names[0] && names[1]) c.push(`${names[0]} vs ${names[1]}`);
      if (names[0] && names[1]) c.push(`If I stop ${names[1]} and focus ${names[0]}?`);
      setChips(c);
    });
  }, [open, chips.length]);

  function run(question: string) {
    if (!question.trim() || busy) return;
    setHide(false);
    start(`What-if: ${question.trim()}`, () => runWhatIf(question.trim()));
  }

  if (!apiEnabled()) return null;

  const title = (
    <span className="flex items-center gap-2">
      <FlaskConical size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
      <span className="text-sm font-display" style={{ color: "var(--text)" }}>Simulate</span>
    </span>
  );

  return (
    <CollapsibleSection persistKey="home_simulate" open={open} onToggle={toggle} tint="var(--gold)" title={title} defaultOpen={false}>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void run(q); }}
          placeholder="What happens if…?"
          className="flex-1 px-3 py-2.5"
          style={{ fontSize: 14, background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6 }}
        />
        <button onClick={() => void run(q)} disabled={busy || !q.trim()} className="press px-4 text-sm font-semibold" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)", opacity: busy || !q.trim() ? 0.5 : 1 }}>
          {busy ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : "Run"}
        </button>
      </div>
      {chips.length > 0 && !result && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {chips.map((c) => (
            <button key={c} onClick={() => { setQ(c); void run(c); }} className="press cap-data px-2.5 py-1" style={{ borderRadius: 999, border: "1px solid var(--line)", color: "var(--text-dim)" }}>{c}</button>
          ))}
        </div>
      )}

      {result && (
        <div className="mt-3 animate-fade-in-up">
          <p className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>{result.kind === "comparison" ? "Comparison" : "Scenario"} · est. confidence {Math.round(result.confidence * 100)}%</p>
          {result.kind === "scenario" && result.outcomes?.map((o) => <OutcomeRow key={o.band} o={o} />)}
          {result.kind === "comparison" && result.options?.map((opt) => (
            <div key={opt.name} className="py-2" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 14, color: "var(--text)" }}>{opt.name}</span>
                <span className="cap-data ml-auto" style={{ color: "var(--gold)" }}>feasibility {opt.score}</span>
              </div>
              <p className="cap-data" style={{ color: "var(--text-dim)" }}>{opt.rationale}</p>
              <div className="mt-1">{opt.outcomes.map((o) => <OutcomeRow key={o.band} o={o} />)}</div>
            </div>
          ))}
          <div className="mt-3 p-3 animate-pop" style={{ borderRadius: 10, border: "1px solid var(--gold-line)", background: "var(--surface-2)" }}>
            <span className="cap-data" style={{ color: "var(--gold)" }}>Recommendation</span>
            <p className="mt-1" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text)" }}>{result.recommendation}</p>
          </div>
          {result.assumptions?.length > 0 && (
            <div className="mt-2">
              {result.assumptions.map((a, i) => (
                <p key={i} className="cap-data" style={{ color: "var(--text-dim)" }}>· {a}</p>
              ))}
            </div>
          )}
          <button onClick={() => { setHide(true); setQ(""); }} className="press cap-data mt-2" style={{ color: "var(--gold)" }}>← new simulation</button>
        </div>
      )}
    </CollapsibleSection>
  );
}
