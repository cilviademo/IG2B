import { useState } from "react";
import { Bell, ExternalLink, RotateCcw, X, CheckCheck, Trash2 } from "lucide-react";
import Sheet from "./Sheet";
import { useTasks, isTerminal, type TaskStatus } from "@/contexts/TaskCenter";

// Global Notification Center — persistent history of every AI task across routes/reloads.
// The bell (in TopBar) shows the unread count; the sheet lists completed/failed/running
// cards with Open-result, Retry, and Dismiss. Does not rely on any panel staying open.

const STATUS_STYLE: Record<TaskStatus, { color: string; label: string }> = {
  queued: { color: "var(--gold)", label: "queued" },
  running: { color: "var(--gold)", label: "running" },
  completed: { color: "var(--good)", label: "done" },
  fallback: { color: "var(--gold)", label: "fallback" },
  failed: { color: "var(--risk)", label: "failed" },
  "budget-limited": { color: "var(--gold)", label: "budget" },
  skipped: { color: "var(--text-dim)", label: "skipped" },
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const { tasks, unreadCount, accept, retry, dismiss, markAllSeen, clearTerminal } = useTasks();
  const unread = unreadCount();
  const list = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <button
        onClick={() => { setOpen(true); }}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        className="relative tap-target"
        style={{ color: "var(--text-dim)" }}
      >
        <Bell size={18} strokeWidth={1.5} />
        {unread > 0 && (
          <span className="absolute pulse-soft" style={{ top: 4, right: 4, minWidth: 15, height: 15, padding: "0 4px", borderRadius: 999, background: "var(--gold)", color: "#161118", fontSize: 9, fontWeight: 700, lineHeight: "15px", textAlign: "center" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <Sheet title="Notifications" onClose={() => setOpen(false)}>
          <div className="flex items-center gap-3 mb-2">
            <span className="cap-data" style={{ color: "var(--text-dim)" }}>{list.length} item{list.length === 1 ? "" : "s"}{unread > 0 ? ` · ${unread} unread` : ""}</span>
            <button onClick={markAllSeen} className="press ml-auto inline-flex items-center gap-1 cap-data" style={{ color: "var(--text-dim)" }}><CheckCheck size={12} strokeWidth={1.5} /> Mark read</button>
            <button onClick={clearTerminal} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--text-dim)" }}><Trash2 size={12} strokeWidth={1.5} /> Clear</button>
          </div>

          {list.length === 0 ? (
            <p className="py-6 text-center" style={{ fontSize: 13, color: "var(--text-dim)" }}>No activity yet. AI actions appear here.</p>
          ) : (
            <div className="space-y-2">
              {list.map((t) => {
                const st = STATUS_STYLE[t.status];
                const openable = (t.status === "completed" || t.status === "fallback") && Boolean(t.childNodeId || t.subjectId || t.result !== undefined);
                return (
                  <div key={t.id} className={`p-3 ${!t.seen && isTerminal(t.status) ? "" : ""}`} style={{ borderRadius: 10, border: `1px solid ${!t.seen && isTerminal(t.status) ? "var(--gold-line)" : "var(--line)"}`, background: "var(--surface)" }}>
                    <div className="flex items-center gap-2">
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: st.color, display: "inline-block", flexShrink: 0 }} />
                      <span className="truncate" style={{ fontSize: 13.5, color: "var(--text)" }}>{t.label}</span>
                      <span className="cap-data ml-auto" style={{ color: st.color }}>{st.label}</span>
                    </div>
                    <div className="cap-data mt-0.5" style={{ color: "var(--text-dim)" }}>
                      {t.feature || t.kind}{t.error ? ` · ${t.error}` : ""}
                    </div>
                    {(openable || t.status === "failed") && (
                      <div className="flex gap-2 mt-2">
                        {openable && (
                          <button onClick={() => { accept(t.id); setOpen(false); }} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
                            <ExternalLink size={12} strokeWidth={1.5} /> Open result
                          </button>
                        )}
                        {t.status === "failed" && (
                          <button onClick={() => retry(t.id)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                            <RotateCcw size={12} strokeWidth={1.5} /> Retry
                          </button>
                        )}
                        <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="press inline-flex items-center justify-center ml-auto" style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                          <X size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
