import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Globe, ExternalLink, RefreshCw, Scale, Clock, AlertTriangle, HelpCircle, Newspaper, Check, Ban } from "lucide-react";
import { toast } from "sonner";
import { apiEnabled, getWorldLens, addNegative, type WorldLensData, type WorldLensSection } from "@/lib/api";

// World Lens (Intelligence review): for a subject (node/project/topic) — "what changed OUTSIDE
// your vault?" Reads /world-lens?subject=&kind=&title=. Deterministic sections from claims +
// relevant external evidence + tensions. Reached from the Atlas node sheet ("World Lens").
function param(k: string): string {
  try { return new URLSearchParams(window.location.search).get(k) || ""; } catch { return ""; }
}
const SECTION_ICON: Record<string, typeof Globe> = { new: Newspaper, counter: AlertTriangle, claims: Check, corrections: Clock, tensions: Scale, gaps: Ban, questions: HelpCircle };
const relTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

export default function WorldLens() {
  const subject = param("subject");
  const kind = param("kind") || "topic";
  const title = param("title");
  const [lens, setLens] = useState<WorldLensData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (!apiEnabled() || !subject) { setLoaded(true); return; }
    setLoading(true);
    setLens(await getWorldLens(subject, kind, title || undefined));
    setLoading(false); setLoaded(true);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function noteGap() {
    const note = window.prompt(`Note a gap or exclusion for "${lens?.subjectTitle || title || subject}"\n(e.g. "looked for X, found nothing" / "excluded — decided against")`);
    if (!note || !note.trim()) return;
    if (await addNegative(subject, "excluded", note.trim())) { toast.success("Noted"); void load(); } else toast.error("Couldn't save");
  }

  return (
    <div className="px-5 pt-6 pb-12">
      <div className="flex items-center gap-2 mb-1">
        <Globe size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">World Lens</h1>
        {subject && apiEnabled() && (
          <button onClick={() => void noteGap()} className="press ml-auto inline-flex items-center gap-1 cap-data" style={{ color: "var(--text-dim)" }}>
            <Ban size={12} strokeWidth={1.5} /> Note a gap
          </button>
        )}
        <button onClick={() => void load()} className={`tap-target ${subject && apiEnabled() ? "" : "ml-auto"}`} aria-label="Refresh" style={{ color: "var(--text-dim)" }}>
          <RefreshCw size={15} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="cap-data mb-4" style={{ color: "var(--text-dim)" }}>
        What changed outside your vault{lens?.subjectTitle ? ` · ${lens.subjectTitle}` : title ? ` · ${title}` : ""}
      </p>

      {!apiEnabled() ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>API not configured on this device.</p>
      ) : !subject ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Open a node's “World Lens” from the Atlas to see what the world knows about it.</p>
      ) : !loaded ? (
        <p className="pulse-soft" style={{ fontSize: 13, color: "var(--text-dim)" }}>Looking outward…</p>
      ) : !lens || lens.sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
          <Globe size={22} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
          <span style={{ fontSize: 14, color: "var(--text-dim)" }}>Nothing from the outside world yet.</span>
          <span className="cap-data" style={{ color: "var(--text-dim)" }}>Add feeds in the Research Inbox; relevant evidence will surface here.</span>
        </div>
      ) : (
        <div className="space-y-6">
          {lens.sections.map((s) => <Section key={s.key} s={s} />)}
        </div>
      )}
    </div>
  );
}

function Section({ s }: { s: WorldLensSection }) {
  const Icon = SECTION_ICON[s.key] || Newspaper;
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <span className="cap-data" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
      </div>
      <div className="space-y-2">
        {s.evidence?.map((e) => (
          <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" className="press block p-3" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>
            <div className="cap-data mb-0.5 inline-flex items-center gap-1" style={{ color: "var(--text-dim)" }}>{e.source || e.kind} · {relTime(e.retrieved_at)}{e.stale ? " · stale" : ""}</div>
            <div className="inline-flex items-start gap-1.5" style={{ fontSize: 14, color: "var(--text)" }}>{e.title} <ExternalLink size={11} strokeWidth={1.5} style={{ color: "var(--text-dim)", flexShrink: 0, marginTop: 3 }} /></div>
          </a>
        ))}
        {s.claims?.map((c) => (
          <div key={c.id} className="p-3" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              {c.contested && <span className="cap-data inline-flex items-center gap-0.5" style={{ color: "var(--gold)" }}><Scale size={9} strokeWidth={1.5} /> contested</span>}
              {c.stale && <span className="cap-data inline-flex items-center gap-0.5" style={{ color: "var(--risk)" }}><Clock size={9} strokeWidth={1.5} /> stale</span>}
              <span className="cap-data ml-auto" style={{ color: "var(--text-dim)" }}>{Math.round((c.confidence || 0) * 100)}% · {c.owner_status}</span>
            </div>
            <span style={{ fontSize: 14, color: "var(--text)" }}>{c.statement}</span>
          </div>
        ))}
        {s.notes?.map((n, i) => (
          <div key={i} className="p-3" style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text)", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>{n}</div>
        ))}
      </div>
      {s.key === "tensions" && <Link href="/tensions" className="press cap-data inline-block mt-1.5" style={{ color: "var(--gold)" }}>Open Tensions →</Link>}
    </section>
  );
}
