import { useCallback, useEffect, useState } from "react";
import { Swords, Sparkles, Loader2 } from "lucide-react";
import { getQuests, suggestQuests, apiEnabled, type Quest } from "@/lib/api";
import { questBucket, type QuestBucket as Bucket } from "@/lib/quests";
import QuestCard from "./QuestCard";

// Mission Control's quest surface. Every quest lands in exactly ONE clearly-labelled
// section (via the shared `questBucket`), so after any button press the card visibly
// moves. Backend is the source of truth (persists across reload); a localStorage cache
// hydrates instantly on reload and covers offline. Deterministic + stub-safe.
const CACHE_KEY = "indigold_quests_cache";

// Ordered sections + their empty-state copy (every section always shows its copy).
const SECTIONS: { bucket: Bucket; label: string; color: string; empty: string }[] = [
  { bucket: "active", label: "Active Today", color: "var(--good)", empty: "No active quests. Accept a suggestion to start one." },
  { bucket: "blocked", label: "Blocked", color: "var(--risk)", empty: "Nothing blocked." },
  { bucket: "snoozed", label: "Snoozed / Later", color: "var(--text-dim)", empty: "Nothing snoozed." },
  { bucket: "suggested", label: "Suggested", color: "var(--gold)", empty: "No suggestions right now — tap Suggest." },
  { bucket: "converted", label: "Converted to Project", color: "var(--info)", empty: "No quests converted to projects yet." },
  { bucket: "completed", label: "Completed", color: "var(--good)", empty: "Nothing completed yet." },
];

export default function QuestsPanel() {
  const [quests, setQuests] = useState<Quest[]>(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);

  const refresh = useCallback(async () => {
    const r = await getQuests(); // all states; we bucket client-side
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
      <div className="mt-7">
        <Head />
        <p className="py-2" style={{ fontSize: 13, color: "var(--text-dim)" }}>
          Quests come from your live vault — connect the API to turn briefs, insights and Companion answers into playable actions.
        </p>
      </div>
    );
  }

  const now = Date.now();
  const byBucket: Record<Bucket, Quest[]> = { active: [], blocked: [], snoozed: [], suggested: [], converted: [], completed: [] };
  for (const q of quests) {
    const b = questBucket(q, now);
    if (b) byBucket[b].push(q);
  }

  return (
    <div className="mt-7">
      <Head
        action={
          <button onClick={onSuggest} disabled={suggesting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            {suggesting ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Sparkles size={12} strokeWidth={1.5} />} Suggest
          </button>
        }
      />
      {loading && quests.length === 0 ? (
        <p className="py-2" style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading quests…</p>
      ) : (
        SECTIONS.map(({ bucket, label, color, empty }) => {
          const items = byBucket[bucket];
          // Blocked is only shown when it has items (it's not one of the five core sections).
          if (bucket === "blocked" && items.length === 0) return null;
          return (
            <div key={bucket} className="mt-3">
              <div className="cap-data mb-1.5" style={{ color }}>{label}{items.length ? ` · ${items.length}` : ""}</div>
              {items.length === 0 ? (
                <p className="pb-1" style={{ fontSize: 12.5, color: "var(--text-dim)", opacity: 0.7 }}>{empty}</p>
              ) : (
                items.map((q) => <QuestCard key={q.id} quest={q} bucket={bucket} onChange={refresh} />)
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function Head({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Swords size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
      <h2 className="text-sm font-display" style={{ color: "var(--text)" }}>Quests</h2>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
