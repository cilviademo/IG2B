import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Swords, Sparkles, Loader2 } from "lucide-react";
import { getQuests, suggestQuests, apiEnabled, type Quest } from "@/lib/api";
import { questBucket, type QuestBucket as Bucket } from "@/lib/quests";
import QuestCard from "./QuestCard";
import CollapsibleSection from "./CollapsibleSection";
import { useTaskAction } from "@/contexts/TaskCenter";

// AURORA A3 — Quests collapsed to THREE human groups: Today · Later · Archive. The six
// underlying buckets (active/blocked/snoozed/suggested/converted/completed) map onto them;
// the state machine is unchanged. Empty groups hide; the whole-empty board shows one
// inviting state (A12). Backend is source of truth; a localStorage cache hydrates instantly.
const CACHE_KEY = "indigold_quests_cache";

const GROUPS: { key: string; label: string; color: string; buckets: Bucket[]; defaultOpen: boolean }[] = [
  { key: "today", label: "Today", color: "var(--good)", buckets: ["active", "blocked"], defaultOpen: true },
  { key: "later", label: "Later", color: "var(--gold)", buckets: ["suggested", "snoozed"], defaultOpen: true },
  { key: "archive", label: "Archive", color: "var(--text-dim)", buckets: ["completed", "converted"], defaultOpen: false },
];
const HOME_CAP = 3;

export default function QuestsPanel({ variant = "home" }: { variant?: "home" | "full" }) {
  const full = variant === "full";
  const [quests, setQuests] = useState<Quest[]>(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const { start, busy: suggesting, result: suggestRes } = useTaskAction<unknown>("quests", "/quests");

  const refresh = useCallback(async () => {
    const r = await getQuests();
    if (r) {
      setQuests(r.items);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(r.items)); } catch { /* quota */ }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (suggestRes) void refresh(); }, [suggestRes, refresh]);

  function onSuggest() { if (!suggesting) start("Suggest quests", () => suggestQuests()); }

  const SuggestBtn = (
    <button onClick={onSuggest} disabled={suggesting} className="press flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
      {suggesting ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Sparkles size={12} strokeWidth={1.5} />} Suggest
    </button>
  );

  if (!apiEnabled()) {
    return (
      <div className={full ? "" : "mt-7"}>
        <Head full={full} />
        <p className="py-3" style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55 }}>
          Quests come from your live vault — connect to turn briefs, insights and Companion answers into playable actions.
        </p>
      </div>
    );
  }

  const now = Date.now();
  const byBucket: Record<Bucket, Quest[]> = { active: [], blocked: [], snoozed: [], suggested: [], converted: [], completed: [] };
  let archivedCount = 0;
  for (const q of quests) {
    if (q.state === "archived") { archivedCount++; continue; }
    const b = questBucket(q, now);
    if (b) byBucket[b].push(q);
  }
  const inPlay = byBucket.active.length + byBucket.blocked.length + byBucket.suggested.length + byBucket.snoozed.length + byBucket.completed.length + byBucket.converted.length;

  return (
    <div className={full ? "" : "mt-7"}>
      <Head full={full} action={SuggestBtn} />

      {loading && quests.length === 0 ? (
        <p className="py-2 pulse-soft" style={{ fontSize: 14, color: "var(--text-dim)" }}>Loading quests… <span className="cap-data">(free-tier API may be waking)</span></p>
      ) : inPlay === 0 ? (
        // A12 — inviting, honest empty board (never "No quests").
        <div className="text-center" style={{ padding: "var(--s-6, 32px) 8px", maxWidth: 320, margin: "0 auto" }}>
          <div style={{ width: 52, height: 52, margin: "0 auto 14px", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gold-soft)", border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            <Swords size={22} strokeWidth={1.5} />
          </div>
          <h3 className="font-display" style={{ fontSize: "1.0625rem", color: "var(--text)", marginBottom: 6 }}>Nothing urgent today</h3>
          <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55, marginBottom: 14 }}>Generate suggestions from your briefs, inbox and Time Machine — or enjoy the quiet.</p>
          {SuggestBtn}
        </div>
      ) : (
        <>
          {GROUPS.map((g) => {
            const items = g.buckets.flatMap((b) => byBucket[b]);
            if (items.length === 0) return null; // hide empty groups
            const shown = full ? items : items.slice(0, HOME_CAP);
            return (
              <CollapsibleSection
                key={g.key}
                tint={g.color}
                persistKey={`quests_${full ? "full" : "home"}_${g.key}`}
                defaultOpen={g.defaultOpen}
                title={<span className="cap-data" style={{ color: g.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.label} · {items.length}</span>}
              >
                {shown.map((q) => <QuestCard key={q.id} quest={q} bucket={questBucket(q, now) || "active"} onChange={refresh} />)}
                {!full && items.length > shown.length && (
                  <Link href="/quests" className="cap-data" style={{ color: "var(--gold)" }}>+{items.length - shown.length} more →</Link>
                )}
              </CollapsibleSection>
            );
          })}
          {full && archivedCount > 0 && (
            <p className="cap-data mt-3" style={{ color: "var(--text-dim)" }}>+ {archivedCount} archived</p>
          )}
        </>
      )}
    </div>
  );
}

function Head({ full, action }: { full?: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Swords size={full ? 18 : 14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
      {full
        ? <h1 className="text-xl font-display" style={{ color: "var(--text)" }}>Quests</h1>
        : <Link href="/quests"><h2 className="text-sm font-display" style={{ color: "var(--text)" }}>Quests</h2></Link>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
