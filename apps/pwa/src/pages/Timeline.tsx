import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useJson } from "@/hooks/useJson";
import type { TimelineEvent } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { apiEnabled, getNarrative, type NarrativeChapter, type MomentKind } from "@/lib/api";
import { Users, Star, Lightbulb, FolderOpen, Target, History, Search, Sparkles } from "lucide-react";

// Moment kind → icon + accent (shared by the narrative + the static demo fallback).
const KIND_CONFIG: Record<MomentKind, { icon: typeof Users; color: string }> = {
  capture: { icon: FolderOpen, color: "var(--info)" },
  idea: { icon: Lightbulb, color: "var(--gold)" },
  decision: { icon: Target, color: "var(--gold)" },
  connection: { icon: Users, color: "var(--info)" },
  milestone: { icon: Star, color: "var(--gold)" },
  research: { icon: Search, color: "var(--info)" },
};
const SIG_DOT: Record<"critical" | "high" | "medium", string> = { critical: "var(--gold)", high: "var(--info)", medium: "var(--text-dim)" };

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Header() {
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-display">Timeline</h1>
        <Link href="/time-machine" className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
          <History size={13} strokeWidth={1.5} /> Time Machine
        </Link>
      </div>
      <p className="mb-5" style={{ fontSize: 12, color: "var(--text-dim)" }}>The story of your thinking</p>
    </>
  );
}

// Live narrative — chapters (This week / Last week / by month), each with a deterministic
// summary + a spine of its notable moments.
function NarrativeView({ chapters }: { chapters: NarrativeChapter[] }) {
  let idx = 0;
  return (
    <div>
      {chapters.map((ch) => (
        <section key={ch.key} className="mb-8">
          <div className="flex items-baseline gap-2 mb-1">
            <h2 className="font-display" style={{ fontSize: 17, color: "var(--text)" }}>{ch.label}</h2>
            <span className="cap-data" style={{ color: "var(--text-dim)" }}>{fmtDate(ch.startISO)} – {fmtDate(ch.endISO)}</span>
          </div>
          <p className="mb-4" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-dim)" }}>{ch.summary}</p>
          <div className="relative pl-7">
            <div className="absolute left-[3px] top-2 bottom-2" style={{ width: 1, background: "var(--line)" }} />
            {ch.moments.map((mo) => {
              const cfg = KIND_CONFIG[mo.kind];
              const Icon = cfg.icon;
              return (
                <div key={mo.id} className="relative mb-5 animate-fade-in-up" style={{ animationDelay: `${(idx++ % 12) * 35}ms` }}>
                  <span className="absolute top-1.5" style={{ left: -27, width: 8, height: 8, borderRadius: 999, background: cfg.color }} />
                  <div className="flex items-center gap-2 mb-0.5">
                    <Icon size={13} strokeWidth={1.5} style={{ color: cfg.color }} />
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{mo.kind}</span>
                    <span className="cap-data ml-2" style={{ color: "var(--text-dim)" }}>{fmtDate(mo.date)}</span>
                    {mo.significance === "critical" && <span className="ml-auto" style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: SIG_DOT.critical }} />}
                  </div>
                  <h3 className="font-semibold line-clamp-2" style={{ fontSize: 15, color: "var(--text)" }}>{mo.title}</h3>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// Static demo (offline / not signed in) — the original sample-timeline rendering.
function SampleView() {
  const { data, loading, error } = useJson<{ events: TimelineEvent[] }>("/data/sample_timeline.json");
  if (loading) return <Loading label="Temporal View" />;
  if (error || !data) return <ErrorState message={error ?? "no data"} />;
  const events = [...data.events].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="relative pl-7">
      <div className="absolute left-[3px] top-2 bottom-2" style={{ width: 1, background: "var(--line)" }} />
      {events.map((ev, i) => (
        <div key={ev.id} className="relative mb-7 animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
          <span className="absolute top-1.5" style={{ left: -27, width: 8, height: 8, borderRadius: 999, background: "var(--gold)" }} />
          <div className="flex items-center gap-2 mb-1">
            <Star size={13} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{ev.type}</span>
            <span className="cap-data ml-2" style={{ color: "var(--text-dim)" }}>{new Date(ev.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
          <h3 className="font-semibold" style={{ fontSize: 16, color: "var(--text)" }}>{ev.title}</h3>
          <p className="mt-0.5" style={{ fontSize: 14, lineHeight: 1.45, color: "var(--text-dim)" }}>{ev.description}</p>
        </div>
      ))}
    </div>
  );
}

export default function Timeline() {
  const [chapters, setChapters] = useState<NarrativeChapter[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!apiEnabled()) { setLoaded(true); return; }
    (async () => {
      const r = await getNarrative();
      if (alive) { setChapters(r?.chapters ?? []); setLoaded(true); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="px-5 pt-6 pb-6">
      <Header />
      {!apiEnabled() ? (
        <SampleView />
      ) : !loaded ? (
        <Loading label="Your story" />
      ) : chapters && chapters.length > 0 ? (
        <NarrativeView chapters={chapters} />
      ) : (
        <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
          <Sparkles size={22} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
          <span style={{ fontSize: 14, color: "var(--text-dim)" }}>Your story starts here.</span>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Capture something and Radian will start narrating your timeline.</span>
        </div>
      )}
    </div>
  );
}
