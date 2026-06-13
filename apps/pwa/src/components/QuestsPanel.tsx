import { useCallback, useEffect, useState } from "react";
import { Swords, Sparkles, Loader2 } from "lucide-react";
import { getQuests, suggestQuests, apiEnabled, type Quest } from "@/lib/api";
import QuestCard from "./QuestCard";
import { isInPlay, type QuestState } from "@/lib/quests";

// Mission Control's quest surface: today's in-play quests (accepted/active), anything
// blocked, and a roster of suggested actions you can accept. All deterministic + live
// from the backend; never blocks on a model. Renders a quiet, honest state offline.
export default function QuestsPanel() {
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);

  const refresh = useCallback(async () => {
    const r = await getQuests("suggested,accepted,active,blocked");
    setQuests(r?.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function onSuggest() {
    setSuggesting(true);
    await suggestQuests();
    await refresh();
    setSuggesting(false);
  }

  const inPlay = (quests || []).filter((q) => isInPlay(q.state as QuestState));
  const blocked = (quests || []).filter((q) => q.state === "blocked");
  const suggested = (quests || []).filter((q) => q.state === "suggested");

  if (!apiEnabled()) {
    return (
      <div className="mt-7">
        <SectionHead />
        <p className="py-2" style={{ fontSize: 13, color: "var(--text-dim)" }}>
          Quests come from your live vault — connect the API to turn briefs, insights and Companion answers into playable actions.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-7">
      <SectionHead
        action={
          <button onClick={onSuggest} disabled={suggesting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 999, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            {suggesting ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Sparkles size={12} strokeWidth={1.5} />} Suggest
          </button>
        }
      />
      {loading ? (
        <p className="py-2" style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading quests…</p>
      ) : (
        <>
          {inPlay.length > 0 && (
            <>
              <div className="cap-data mt-2 mb-1.5" style={{ color: "var(--good)" }}>Active today · {inPlay.length}</div>
              {inPlay.map((q) => <QuestCard key={q.id} quest={q} onChange={refresh} />)}
            </>
          )}
          {blocked.length > 0 && (
            <>
              <div className="cap-data mt-2 mb-1.5" style={{ color: "var(--risk)" }}>Blocked · {blocked.length}</div>
              {blocked.map((q) => <QuestCard key={q.id} quest={q} onChange={refresh} />)}
            </>
          )}
          {suggested.length > 0 && (
            <>
              <div className="cap-data mt-2 mb-1.5" style={{ color: "var(--text-dim)" }}>Suggested · {suggested.length}</div>
              {suggested.slice(0, 5).map((q) => <QuestCard key={q.id} quest={q} onChange={refresh} />)}
            </>
          )}
          {inPlay.length === 0 && blocked.length === 0 && suggested.length === 0 && (
            <p className="py-2" style={{ fontSize: 13, color: "var(--text-dim)" }}>No quests yet. Tap <b style={{ color: "var(--gold)" }}>Suggest</b> to turn today's brief + forgotten gems into actions.</p>
          )}
        </>
      )}
    </div>
  );
}

function SectionHead({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Swords size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
      <h2 className="text-sm font-display" style={{ color: "var(--text)" }}>Quests</h2>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
