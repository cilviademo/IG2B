import { useEffect, useState } from "react";
import { Telescope, Loader2, ChevronRight } from "lucide-react";
import { getHorizon, runHorizonScan, apiEnabled, type HorizonDirection } from "@/lib/api";
import CollapsibleSection from "./CollapsibleSection";
import { useTaskAction } from "@/contexts/TaskCenter";

// Mission Control — Research Horizon (G6). Deterministic research directions across your
// active domains (what to scan next, computed from graph gaps — never fabricated
// findings). A scan files a `horizon` brief and seeds research quests, closing the loop:
// Research → Capture → Classify → Graph → Context Pack → Brief → Quest.
const PRIO_COLOR: Record<string, string> = { high: "var(--gold)", med: "var(--info)", low: "var(--text-dim)" };

export default function ResearchPanel() {
  const [loaded, setLoaded] = useState<{ dirs: HorizonDirection[]; chain: string[]; scannedAt: string | null } | null>(null);
  // The scan runs in the background via the Task Center (notifies on Home when ready).
  const { start, busy, result: scan } = useTaskAction<{ directions: HorizonDirection[]; quests_created: number; chain: string[] } | null>("horizon", "/");

  useEffect(() => {
    getHorizon().then((r) => { if (r) setLoaded({ dirs: r.horizon?.payload.directions ?? [], chain: r.chain || [], scannedAt: r.horizon?.payload.scanned_at ?? null }); });
  }, []);

  // Prefer a fresh scan result; else the loaded horizon brief.
  const dirs = scan?.directions ?? loaded?.dirs ?? null;
  const chain = scan?.chain ?? loaded?.chain ?? [];
  const scannedAt = scan ? new Date().toISOString() : (loaded?.scannedAt ?? null);
  const note = scan ? `${scan.directions.length} directions · ${scan.quests_created} research quest${scan.quests_created === 1 ? "" : "s"} added → see Quests` : null;

  function runScan() { if (busy) return; start("Research horizon scan", () => runHorizonScan()); }

  if (!apiEnabled()) return null;

  const title = (
    <span className="flex items-center gap-2">
      <Telescope size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
      <span className="text-sm font-display" style={{ color: "var(--text)" }}>Research Horizon</span>
    </span>
  );
  const action = (
    <button onClick={runScan} disabled={busy} className="press flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
      {busy ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Telescope size={12} strokeWidth={1.5} />} Scan now
    </button>
  );

  return (
    <CollapsibleSection persistKey="home_research" tint="var(--gold)" title={title} action={action}>
      {/* the deterministic chain a direction travels */}
      {chain.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {chain.map((c, i) => (
            <span key={c} className="flex items-center cap-data" style={{ color: "var(--text-dim)" }}>
              {c}{i < chain.length - 1 && <ChevronRight size={10} strokeWidth={1.5} style={{ margin: "0 1px" }} />}
            </span>
          ))}
        </div>
      )}
      {note && <p className="mb-2 cap-data animate-pop" style={{ color: "var(--good)" }}>{note}</p>}
      {dirs === null ? (
        <p className="py-1" style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading…</p>
      ) : dirs.length === 0 ? (
        <p className="py-1" style={{ fontSize: 13, color: "var(--text-dim)" }}>No directions yet — tap <b style={{ color: "var(--gold)" }}>Scan now</b> to plan research across your domains.</p>
      ) : (
        <>
          {dirs.map((d, i) => (
            <div key={i} className="py-2 animate-fade-in-up" style={{ borderBottom: "1px solid var(--line)", animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIO_COLOR[d.priority] }} />
                <span style={{ fontSize: 14, color: "var(--text)" }}>{d.topic}</span>
              </div>
              <p className="mt-0.5 cap-data" style={{ color: "var(--text-dim)" }}>{d.rationale}</p>
            </div>
          ))}
          {scannedAt && <p className="cap-data mt-2" style={{ color: "var(--text-dim)" }}>last scan {new Date(scannedAt).toLocaleDateString()}</p>}
        </>
      )}
    </CollapsibleSection>
  );
}
