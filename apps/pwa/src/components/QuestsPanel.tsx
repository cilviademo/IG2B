import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Swords, Sparkles, Loader2 } from "lucide-react";
import { getQuests, suggestQuests, apiEnabled, type Quest } from "@/lib/api";
import { questBucket, type QuestBucket as Bucket } from "@/lib/quests";
import QuestCard from "./QuestCard";
import CollapsibleSection from "./CollapsibleSection";

// Mission Control's quest surface. Every quest lands in exactly ONE clearly-labelled
// section (via the shared `questBucket`), so after any button press the card visibly
// moves. Backend is the source of truth (persists across reload); a localStorage cache
// hydrates instantly on reload and covers offline. Deterministic + stub-safe.
//   variant "home" — compact: in-play first, capped, links to the full Quests tab.
//   variant "full" — the dedicated Quests tab: every section, no caps, + Archived.
const CACHE_KEY = "indigold_quests_cache";

const SECTIONS: { bucket: Bucket; label: string; color: string; empty: string }[] = [
  { bucket: "active", label: "Active Today", color: "var(--good)", empty: "No active quests. Accept a suggestion to start one." },
  { bucket: "blocked", label: "Blocked", color: "var(--risk)", empty: "Nothing blocked." },
  { bucket: "snoozed", label: "Snoozed / Later", color: "var(--text-dim)", empty: "Nothing snoozed." },
  { bucket: "suggested", label: "Suggested", color: "var(--gold)", empty: "No suggestions right now — tap Suggest." },
  { bucket: "converted", label: "Converted to Project", color: "var(--info)", empty: "No quests converted to projects yet." },
  { bucket: "completed", label: "Completed", color: "var(--good)", empty: "Nothing completed yet." },
];
const HOME_CAP = 3;

export default function QuestsPanel({ variant = "home" }: { variant?: "home" | "full" }) {
  const full = variant === "full";
  const [quests, setQuests] = useState<Quest[]>(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);

  const refresh = useCallback(async () => {
    const r = await getQuests();
    if (r) {
      setQuests(r.items);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(r.items)); } catch { /* quota */ }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function onSuggest() {
    setSuggesting(true);
    await suggestQuests();
    await refresh();
    setSuggesting(false);
  }

  if (!apiEnabled()) {
    return (
      <div className={full ? "" : "mt-7"}>
        <Head full={full} />
        <p className="py-2" style={{ fontSize: 13, color: "var(--text-dim)" }}>
          Quests come from your live vault — connect the API to turn briefs, insights and Companion answers into playable actions.
        </p>
      </div>
    );
  }

  const now = Date.now();
  const byBucket: Record<Bucket, Quest[]> = { active: [], blocked: [], snoozed: [], suggested: [], converted: [], completed: [] };
  const archived: Quest[] = [];
  for (const q of quests) {
    if (q.state === "archived") { archived.push(q); continue; }
    const b = questBucket(q, now);
    if (b) byBucket[b].push(q);
  }
  const total = Object.values(byBucket).reduce((a, b) => a + b.length, 0);

  return (
    <div className={full ? "" : "mt-7"}>
      <Head
        full={full}
        action={
          <button onClick={onSuggest} disabled={suggesting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            {suggesting ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Sparkles size={12} strokeWidth={1.5} />} Suggest
          </button>
        }
      />
      {loading && quests.length === 0 ? (
        <p className="py-2 pulse-soft" style={{ fontSize: 14, color: "var(--text-dim)" }}>Loading quests… <span className="cap-data">(free-tier API may be waking)</span></p>
      ) : (
        <>
          {SECTIONS.map(({ bucket, label, color, empty }) => {
            const items = byBucket[bucket];
            // In the compact Home view, hide empty non-core sections and cap the rest.
            if (!full && items.length === 0 && (bucket === "blocked" || bucket === "completed" || bucket === "converted")) return null;
            const shown = full ? items : items.slice(0, HOME_CAP);
            // Default to collapsed for low-signal sections so the surface stays tidy.
            const collapsedByDefault = bucket === "completed" || (bucket === "suggested" && full);
            return (
              <CollapsibleSection
                key={bucket}
                tint={color}
                persistKey={`quests_${full ? "full" : "home"}_${bucket}`}
                defaultOpen={!collapsedByDefault}
                title={<span className="cap-data" style={{ color }}>{label}{items.length ? ` · ${items.length}` : ""}</span>}
              >
                {items.length === 0 ? (
                  <p className="pb-1" style={{ fontSize: 12.5, color: "var(--text-dim)", opacity: 0.7 }}>{empty}</p>
                ) : (
                  <>
                    {shown.map((q) => <QuestCard key={q.id} quest={q} bucket={bucket} onChange={refresh} />)}
                    {!full && items.length > shown.length && (
                      <Link href="/quests" className="cap-data" style={{ color: "var(--gold)" }}>+{items.length - shown.length} more →</Link>
                    )}
                  </>
                )}
              </CollapsibleSection>
            );
          })}

          {full && archived.length > 0 && (
            <CollapsibleSection
              tint="var(--text-dim)"
              persistKey="quests_full_archived"
              defaultOpen={false}
              title={<span className="cap-data" style={{ color: "var(--text-dim)" }}>Archived · {archived.length}</span>}
            >
              {archived.map((q) => (
                <div key={q.id} className="py-1.5" style={{ fontSize: 13, color: "var(--text-dim)", opacity: 0.6 }}>{q.title}</div>
              ))}
            </CollapsibleSection>
          )}

          {!full && total === 0 && byBucket.suggested.length === 0 && (
            <p className="py-2" style={{ fontSize: 13, color: "var(--text-dim)" }}>No quests yet. Tap <b style={{ color: "var(--gold)" }}>Suggest</b> to turn today's brief + forgotten gems into actions.</p>
          )}
        </>
      )}
    </div>
  );
}

function Head({ full, action }: { full?: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Swords size={full ? 16 : 14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
      {full
        ? <h1 className="text-xl font-display" style={{ color: "var(--text)" }}>Quests</h1>
        : <Link href="/quests"><h2 className="text-sm font-display" style={{ color: "var(--text)" }}>Quests</h2></Link>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
