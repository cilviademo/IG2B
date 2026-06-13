import { useState } from "react";
import { Gavel, Swords, Check } from "lucide-react";
import type { BoardroomSynthesis } from "@/lib/api";
import { createQuest } from "@/lib/api";

// Renders a Boardroom synthesis: each persona's contribution, then the resolved action.
// A one-tap "Make it a quest" turns the resolved move into a playable G3 quest.
export default function BoardroomView({ synthesis, nodeId }: { synthesis: BoardroomSynthesis; nodeId?: string }) {
  const [questMade, setQuestMade] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-1">
      {synthesis.lines.map((l, i) => (
        <div key={l.persona} className="py-2.5 animate-fade-in-up" style={{ borderBottom: "1px solid var(--line)", animationDelay: `${i * 45}ms` }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color }} />
            <span className="text-sm font-semibold" style={{ color: l.color }}>{l.name}</span>
          </div>
          <p className="mt-1" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text)" }}>{l.line}</p>
        </div>
      ))}

      <div className="mt-3 p-3 animate-pop" style={{ borderRadius: 10, border: "1px solid var(--gold-line)", background: "var(--surface-2)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Gavel size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
          <span className="cap-data" style={{ color: "var(--gold)" }}>Resolved</span>
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: "var(--text)" }}>{synthesis.resolved}</p>
        {!synthesis.bootstrap && (
          questMade ? (
            <span className="inline-flex items-center gap-1 mt-2 cap-data" style={{ color: "var(--good)" }}><Check size={12} strokeWidth={1.5} /> quest created</span>
          ) : (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await createQuest({ title: synthesis.resolvedAction, summary: synthesis.resolved, kind: "main", source_type: "companion", ...(nodeId ? { node_id: nodeId } : {}), state: "suggested" });
                setBusy(false); setQuestMade(true);
              }}
              className="press inline-flex items-center gap-1.5 mt-2 px-3 py-2 text-xs font-semibold"
              style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)", opacity: busy ? 0.5 : 1 }}
            >
              <Swords size={13} strokeWidth={1.5} /> Make it a quest
            </button>
          )
        )}
      </div>
      <p className="cap-data mt-3" style={{ color: "var(--text-dim)" }}>
        Six-persona council · deterministic from your vault · upgrades to live reasoning when a provider is connected.
      </p>
    </div>
  );
}
