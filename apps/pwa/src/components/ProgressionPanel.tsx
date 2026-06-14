import { useEffect, useState } from "react";
import { Link } from "wouter";
import { TrendingUp, Flame, Zap } from "lucide-react";
import { getProgression, apiEnabled } from "@/lib/api";
import CollapsibleSection, { useCollapsed } from "./CollapsibleSection";

// Mission Control progression (G4): today's XP, the track gaining momentum, a stalled
// track, a recommended action, and a streak — all deterministic from the backend. Quiet
// bootstrap copy when the vault is sparse. No LLM.
interface TrackT { track: string; label: string; color: string; xp: number; level: { level: number; name: string; progress: number; toNext: number; next: number | null }; fromQuests: number; fromCaptures: number }
interface ProgT {
  bootstrap: boolean; todayXp: number; streak: number;
  tracks: TrackT[];
  projects: { id: string; name: string; momentum: string; label: string; color: string; badge: string }[];
  summary: { narrative: string; recommendation: string; gaining: { label: string } | null; stalled: { label: string } | null };
}

export function TrackBar({ t }: { t: TrackT }) {
  // Grow the fill from 0 → target on mount so progress visibly animates in.
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.round(t.level.progress * 100)));
    return () => cancelAnimationFrame(id);
  }, [t.level.progress]);
  return (
    <Link href="/quests" className="tap-row block py-2 animate-fade-in-up" style={{ borderBottom: "1px solid var(--line)" }}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
        <span style={{ fontSize: 14, color: "var(--text)" }}>{t.label}</span>
        <span className="cap-data ml-auto" style={{ color: t.level.level > 0 ? t.color : "var(--text-dim)" }}>
          L{t.level.level} · {t.level.name}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
          <div className="h-full rounded-full bar-fill" style={{ width: `${w}%`, background: t.color }} />
        </div>
        <span className="cap-data" style={{ color: "var(--text-dim)" }}>
          {t.xp} XP{t.level.next != null ? ` · ${t.level.toNext} to next` : " · max"}
        </span>
      </div>
    </Link>
  );
}

export default function ProgressionPanel() {
  const [data, setData] = useState<ProgT | null>(null);
  const [loading, setLoading] = useState(false);
  const { open, toggle } = useCollapsed("home_progression", true);

  // Lazy: fetch only once the section is (or becomes) open — keeps Home's cold load light.
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    setLoading(true);
    getProgression().then((d) => { if (!cancelled) { setData(d as ProgT | null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, data]);

  if (!apiEnabled()) return null; // progression needs the live vault

  const title = (
    <span className="flex items-center gap-2">
      <TrendingUp size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
      <span className="text-sm font-display" style={{ color: "var(--text)" }}>Progression</span>
    </span>
  );

  return (
    <CollapsibleSection persistKey="home_progression" open={open} onToggle={toggle} tint="var(--gold)" title={title}>
      {loading ? (
        <p className="py-2 pulse-soft" style={{ fontSize: 14, color: "var(--text-dim)" }}>Loading progression… <span className="cap-data">(free-tier API may be waking)</span></p>
      ) : !data ? (
        <p className="py-2" style={{ fontSize: 13, color: "var(--text-dim)" }}>Progression unavailable.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center gap-1 px-2 py-1 cap-data animate-pop" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
              <Zap size={11} strokeWidth={1.5} className={data.todayXp > 0 ? "pulse-soft" : undefined} /> +{data.todayXp} XP today
            </span>
            {data.streak > 1 && (
              <span className="flex items-center gap-1 px-2 py-1 cap-data animate-pop" style={{ borderRadius: 999, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                <Flame size={11} strokeWidth={1.5} /> {data.streak}-day streak
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text)" }}>{data.summary.narrative}</p>
          {!data.bootstrap && (
            <div className="mt-2">
              {data.tracks.filter((t) => t.xp > 0).sort((a, b) => b.xp - a.xp).map((t) => <TrackBar key={t.track} t={t} />)}
              {data.tracks.every((t) => t.xp === 0) && (
                <p className="py-1" style={{ fontSize: 12.5, color: "var(--text-dim)" }}>No track XP yet.</p>
              )}
            </div>
          )}
          <Link href="/quests" className="cap-data" style={{ color: "var(--gold)" }}>full skill tree →</Link>
        </>
      )}
    </CollapsibleSection>
  );
}
