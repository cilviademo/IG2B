import { useState } from "react";
import { MessageCircle, Loader2, Sparkles } from "lucide-react";
import { askMentor, apiEnabled, type MentorReply } from "@/lib/api";
import CollapsibleSection from "./CollapsibleSection";

// Mentor Mode (G9) — "talk with past you". Pick a question; the reply is voiced from your
// real history (Time Machine window + decisions/calibration + active focus). Deterministic
// and honest — bootstrap copy when there isn't enough history yet. No model calls.
const QUESTIONS: { intent: string; label: string }[] = [
  { intent: "then", label: "What was I thinking then?" },
  { intent: "changed", label: "What changed?" },
  { intent: "wrong", label: "Where was I wrong?" },
  { intent: "advice", label: "What advice would past-me give?" },
  { intent: "best_self", label: "What would my best self do?" },
];

export default function MentorPanel({ rangeDays = 90 }: { rangeDays?: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [reply, setReply] = useState<MentorReply | null>(null);

  async function ask(intent: string) {
    if (busy) return;
    setBusy(intent); setReply(null);
    const r = await askMentor(intent, rangeDays);
    setReply(r?.reply ?? null);
    setBusy(null);
  }

  if (!apiEnabled()) return null;

  const title = (
    <span className="flex items-center gap-2">
      <MessageCircle size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
      <span className="text-sm font-display" style={{ color: "var(--text)" }}>Mentor — talk with past you</span>
    </span>
  );

  return (
    <CollapsibleSection persistKey="tm_mentor" tint="var(--gold)" title={title} defaultOpen={false}>
      <div className="flex flex-wrap gap-1.5">
        {QUESTIONS.map((q) => (
          <button
            key={q.intent}
            onClick={() => void ask(q.intent)}
            disabled={!!busy}
            className="press cap-data px-2.5 py-1.5"
            style={{ borderRadius: 999, border: "1px solid var(--line)", color: busy === q.intent ? "var(--gold)" : "var(--text-dim)" }}
          >
            {busy === q.intent ? <Loader2 size={11} strokeWidth={1.5} className="animate-spin inline" /> : null} {q.label}
          </button>
        ))}
      </div>

      {reply && (
        <div className="mt-3 p-3 animate-fade-in-up" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}>
          <span className="cap-data" style={{ color: "var(--gold)" }}>{reply.voice}</span>
          <p className="mt-1" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--text)" }}>{reply.answer}</p>
          {reply.points.length > 0 && (
            <div className="mt-2">
              {reply.points.map((p, i) => (
                <p key={i} className="cap-data" style={{ color: "var(--text-dim)" }}>· {p}</p>
              ))}
            </div>
          )}
          {reply.suggestion && (
            <p className="mt-2 flex items-start gap-1.5" style={{ fontSize: 13, color: "var(--text)" }}>
              <Sparkles size={13} strokeWidth={1.5} style={{ color: "var(--gold)", marginTop: 2, flexShrink: 0 }} /> {reply.suggestion}
            </p>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
