import { CheckCircle2, Clock, X } from "lucide-react";
import { useTasks } from "@/contexts/TaskCenter";

// The in-app "ready" pop-up. Surfaces a completed background task that finished on a tab
// you're not currently on; View jumps to it, Snooze leaves a bubble on its tab.
export default function TaskToast() {
  const { toastTask, accept, snooze, dismiss } = useTasks();
  const t = toastTask();
  if (!t) return null;

  return (
    <div className="fixed left-3 right-3 z-[70] animate-fade-in-up" style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      <div className="flex items-center gap-3 p-3" style={{ borderRadius: 12, border: "1px solid var(--gold-line)", background: "color-mix(in srgb, var(--surface) 92%, transparent)", backdropFilter: "blur(12px)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)" }}>
        <CheckCircle2 size={18} strokeWidth={1.5} style={{ color: "var(--good)", flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <div className="cap-data" style={{ color: "var(--good)" }}>Ready</div>
          <div className="truncate" style={{ fontSize: 14, color: "var(--text)" }}>{t.label}</div>
        </div>
        <button onClick={() => accept(t.id)} className="press px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: 8, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>View</button>
        <button onClick={() => snooze(t.id)} aria-label="Snooze" className="press flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
          <Clock size={15} strokeWidth={1.5} />
        </button>
        <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="press" style={{ color: "var(--text-dim)" }}>
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
