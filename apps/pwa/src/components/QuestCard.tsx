import { useState } from "react";
import { Link } from "wouter";
import { Check, Clock, FolderPlus, Play, Swords, RotateCcw, FolderCheck, Share2, Copy, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Quest } from "@/lib/api";
import { questAction, snoozeQuest, resumeQuest, acceptQuest, convertQuestToProject, deleteQuest } from "@/lib/api";
import { QUEST_KIND_STYLE, QUEST_STATE_STYLE, type QuestKind, type QuestState, type QuestBucket as Bucket } from "@/lib/quests";
import { questReward, trackColor } from "@/lib/progression";
import ItemActions, { type ItemAction } from "./ItemActions";

// A single playable action card. The parent decides the bucket; the card shows the
// actions valid there and calls `onChange` so the parent re-buckets immediately. All
// transitions are deterministic + provenanced server-side.
export default function QuestCard({ quest, bucket, onChange }: { quest: Quest; bucket: Bucket; onChange?: () => void }) {
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

  const Btn = ({ icon: Icon, label, onClick, tone = "ghost" }: { icon: typeof Check; label: string; onClick: () => void; tone?: "primary" | "ghost" }) => (
    <button
      disabled={busy}
      onClick={onClick}
      className="press flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
      style={{ borderRadius: 6, border: `1px solid ${tone === "primary" ? "var(--gold-line)" : "var(--line)"}`, color: tone === "primary" ? "var(--gold)" : "var(--text-dim)", opacity: busy ? 0.5 : 1 }}
    >
      <Icon size={13} strokeWidth={1.5} /> {label}
    </button>
  );

  const ts = quest.updated_at ? new Date(quest.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  // Consistent item actions (Issue 6). Archive is the soft path; Delete confirms.
  const questActions: ItemAction[] = [
    { label: "Copy details", icon: Copy, onClick: async () => { try { await navigator.clipboard.writeText(`${quest.title}\n${quest.summary || ""}`); toast.success("Copied"); } catch { toast("Copy blocked"); } } },
    ...(bucket !== "completed" && bucket !== "converted" ? [{ label: "Convert to project", icon: FolderPlus, onClick: async () => { await convertQuestToProject(quest.id); onChange?.(); } } as ItemAction] : []),
    ...(quest.state !== "archived" && bucket !== "completed" ? [{ label: "Archive", icon: Archive, onClick: async () => { try { await questAction(quest.id, "archive"); toast.success("Archived"); onChange?.(); } catch { toast.error("Can't archive from this state"); } } } as ItemAction] : []),
    { label: "Delete permanently", icon: Trash2, tone: "danger", confirm: "Delete this quest permanently? This cannot be undone.", onClick: async () => { const ok = await deleteQuest(quest.id); toast[ok ? "success" : "error"](ok ? "Deleted" : "Delete failed"); if (ok) onChange?.(); } },
  ];

  return (
    <div className="p-3.5 mb-2.5 animate-fade-in-up" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", opacity: bucket === "completed" ? 0.75 : 1 }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] px-2 py-0.5 animate-pop" style={{ borderRadius: 6, border: `1px solid ${kind.color}55`, color: kind.color }}>{kind.label}</span>
        <span className="ml-auto order-last"><ItemActions actions={questActions} /></span>
        {bucket === "completed" ? (
          <span className="flex items-center gap-1 cap-data" style={{ color: "var(--good)" }}><Check size={12} strokeWidth={1.5} /> Completed{ts ? ` · ${ts}` : ""}</span>
        ) : bucket === "converted" ? (
          <span className="flex items-center gap-1 cap-data" style={{ color: "var(--info)" }}><FolderCheck size={12} strokeWidth={1.5} /> Project: {quest.title.slice(0, 28)}</span>
        ) : bucket === "snoozed" ? (
          <span className="flex items-center gap-1 cap-data" style={{ color: "var(--text-dim)" }}><Clock size={12} strokeWidth={1.5} /> Snoozed{quest.snooze_until ? ` · ${new Date(quest.snooze_until).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
        ) : (
          <span className={`cap-data ${bucket === "active" ? "pulse-soft" : ""}`} style={{ color: st.color }}>{st.label}</span>
        )}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.4, color: "var(--text)", textDecoration: bucket === "completed" ? "line-through" : "none" }}>{quest.title}</div>
      {quest.summary && quest.summary !== quest.title && bucket !== "completed" && (
        <p className="mt-1" style={{ fontSize: 13, lineHeight: 1.45, color: "var(--text-dim)" }}>{quest.summary}</p>
      )}
      {/* G4: XP reward + why this matters (hidden once completed/archived). */}
      {bucket !== "completed" && (() => {
        const r = questReward({ kind: quest.kind, title: quest.title });
        return (
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="cap-data px-1.5 py-0.5 animate-pop" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>+{r.xp} XP</span>
              {r.tracks.map((t, i) => (
                <span key={t} className="cap-data" style={{ color: trackColor(t) }}>{r.trackLabels[i]}</span>
              ))}
            </div>
            <p className="mt-1 cap-data" style={{ color: "var(--text-dim)" }}>{r.why}</p>
          </div>
        );
      })()}
      {quest.node_id && (
        <Link href={`/atlas?focus=${quest.node_id}`} className="inline-flex items-center gap-1 mt-2 cap-data" style={{ color: "var(--info)" }}>
          <Share2 size={11} strokeWidth={1.5} /> View on Atlas
        </Link>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {bucket === "suggested" && (
          <>
            <Btn icon={Check} label="Accept" tone="primary" onClick={() => run(() => acceptQuest(quest.id))} />
            <Btn icon={Clock} label="Snooze" onClick={() => run(() => snoozeQuest(quest.id, 24))} />
          </>
        )}
        {bucket === "active" && (
          <>
            <Btn icon={Check} label="Complete" tone="primary" onClick={() => run(() => questAction(quest.id, "complete"))} />
            <Btn icon={FolderPlus} label="Convert to project" onClick={() => run(() => convertQuestToProject(quest.id))} />
            <Btn icon={Clock} label="Snooze" onClick={() => run(() => snoozeQuest(quest.id, 24))} />
          </>
        )}
        {bucket === "snoozed" && (
          <>
            <Btn icon={Play} label="Resume" tone="primary" onClick={() => run(() => resumeQuest(quest.id))} />
            {quest.state === "suggested" && <Btn icon={Check} label="Accept" onClick={() => run(async () => { await resumeQuest(quest.id); await acceptQuest(quest.id); })} />}
          </>
        )}
        {bucket === "blocked" && (
          <>
            <Btn icon={Swords} label="Unblock" tone="primary" onClick={() => run(() => questAction(quest.id, "unblock"))} />
            <Btn icon={Check} label="Complete" onClick={() => run(() => questAction(quest.id, "complete"))} />
          </>
        )}
        {bucket === "converted" && (
          <Btn icon={Check} label="Complete" tone="primary" onClick={() => run(() => questAction(quest.id, "complete"))} />
        )}
        {bucket === "completed" && (
          <Btn icon={RotateCcw} label="Archive" onClick={() => run(() => questAction(quest.id, "archive"))} />
        )}
      </div>
    </div>
  );
}
