import { useState } from "react";
import { Check, Clock, FolderPlus, Play, Swords } from "lucide-react";
import type { Quest } from "@/lib/api";
import { questAction, snoozeQuest, convertQuestToProject } from "@/lib/api";
import { QUEST_KIND_STYLE, QUEST_STATE_STYLE, type QuestKind, type QuestState } from "@/lib/quests";

// A single playable action card. Drives the quest state machine through the backend;
// every action is deterministic + provenanced server-side. `onChange` lets the parent
// refresh its lists after a transition.
export default function QuestCard({ quest, onChange }: { quest: Quest; onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  const kind = QUEST_KIND_STYLE[(quest.kind as QuestKind)] || QUEST_KIND_STYLE.side;
  const st = QUEST_STATE_STYLE[(quest.state as QuestState)] || QUEST_STATE_STYLE.suggested;

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
    onChange?.();
  }

  // Buttons by state (phone-first: large tap targets, primary action first).
  const Btn = ({ icon: Icon, label, onClick, tone = "ghost" }: { icon: typeof Check; label: string; onClick: () => void; tone?: "primary" | "ghost" }) => (
    <button
      disabled={busy}
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
      style={{
        borderRadius: 6,
        border: `1px solid ${tone === "primary" ? "var(--gold-line)" : "var(--line)"}`,
        color: tone === "primary" ? "var(--gold)" : "var(--text-dim)",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Icon size={13} strokeWidth={1.5} /> {label}
    </button>
  );

  return (
    <div className="p-3.5 mb-2.5" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] px-2 py-0.5" style={{ borderRadius: 6, border: `1px solid ${kind.color}55`, color: kind.color }}>{kind.label}</span>
        <span className="cap-data" style={{ color: st.color }}>{st.label}</span>
        {quest.project_id && <span className="cap-data ml-auto" style={{ color: "var(--info)" }}>→ project</span>}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.4, color: "var(--text)" }}>{quest.title}</div>
      {quest.summary && quest.summary !== quest.title && (
        <p className="mt-1" style={{ fontSize: 13, lineHeight: 1.45, color: "var(--text-dim)" }}>{quest.summary}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {quest.state === "suggested" && (
          <>
            <Btn icon={Check} label="Accept" tone="primary" onClick={() => run(() => questAction(quest.id, "accept"))} />
            <Btn icon={Clock} label="Snooze" onClick={() => run(() => snoozeQuest(quest.id, 24))} />
          </>
        )}
        {quest.state === "accepted" && (
          <Btn icon={Play} label="Start" tone="primary" onClick={() => run(() => questAction(quest.id, "start"))} />
        )}
        {(quest.state === "accepted" || quest.state === "active") && (
          <>
            <Btn icon={Check} label="Complete" tone={quest.state === "active" ? "primary" : "ghost"} onClick={() => run(() => questAction(quest.id, "complete"))} />
            <Btn icon={Clock} label="Snooze" onClick={() => run(() => snoozeQuest(quest.id, 24))} />
            {!quest.project_id && <Btn icon={FolderPlus} label="To project" onClick={() => run(() => convertQuestToProject(quest.id))} />}
          </>
        )}
        {quest.state === "blocked" && (
          <>
            <Btn icon={Swords} label="Unblock" tone="primary" onClick={() => run(() => questAction(quest.id, "unblock"))} />
            <Btn icon={Check} label="Complete" onClick={() => run(() => questAction(quest.id, "complete"))} />
          </>
        )}
      </div>
    </div>
  );
}
