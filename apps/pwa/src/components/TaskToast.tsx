import { CheckCircle2, AlertTriangle, Clock, X, ExternalLink } from "lucide-react";
import { useTasks } from "@/contexts/TaskCenter";

// Push-style in-app toast for a task that reached a terminal state on a tab you're NOT on.
// Honest per status: completed/fallback → Open result; failed → reason; budget/skip → note.
export default function TaskToast() {
  const { toastTask, accept, snooze, dismiss } = useTasks();
  const t = toastTask();
  if (!t) return null;

  const ok = t.status === "completed" || t.status === "fallback";
  const failed = t.status === "failed";
  const head = t.status === "completed" ? "Ready"
    : t.status === "fallback" ? "Ready (deterministic)"
    : t.status === "failed" ? "Failed"
    : t.status === "budget-limited" ? "Budget — queued"
    : t.status === "skipped" ? "Skipped" : "Done";
  const color = ok ? "var(--good)" : failed ? "var(--risk)" : "var(--gold)";

  return (
    <div className="fixed left-3 right-3 z-[70] animate-fade-in-up" style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      <div className="flex items-center gap-3 p-3" style={{ borderRadius: 12, border: `1px solid ${color}`, background: "color-mix(in srgb, var(--surface) 92%, transparent)", backdropFilter: "blur(12px)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)" }}>
        {failed ? <AlertTriangle size={18} strokeWidth={1.5} style={{ color, flexShrink: 0 }} /> : <CheckCircle2 size={18} strokeWidth={1.5} style={{ color, flexShrink: 0 }} />}
        <div className="min-w-0 flex-1">
          <div className="cap-data" style={{ color }}>{head}</div>
          <div className="truncate" style={{ fontSize: 14, color: "var(--text)" }}>{t.label}</div>
          {failed && t.error && <div className="cap-data truncate" style={{ color: "var(--text-dim)" }}>{t.error}</div>}
        </div>
        {ok && (
          <button onClick={() => accept(t.id)} className="press inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold shrink-0" style={{ borderRadius: 8, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            <ExternalLink size={12} strokeWidth={1.5} /> Open
          </button>
        )}
        {!ok && (
          <button onClick={() => snooze(t.id)} aria-label="Snooze" className="press flex items-center justify-center shrink-0" style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
            <Clock size={15} strokeWidth={1.5} />
          </button>
        )}
        <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="press shrink-0" style={{ color: "var(--text-dim)" }}>
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
