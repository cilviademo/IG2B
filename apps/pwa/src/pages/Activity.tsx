import { Link } from "wouter";
import { Activity as ActivityIcon, ExternalLink, RotateCcw, Archive, Trash2, Loader2, Check, AlertTriangle, FileText } from "lucide-react";
import { useTasks, isTerminal, type Task, type TaskStatus } from "@/contexts/TaskCenter";

// Stabilization — the AI Activity / Runs screen: the engine room for every AI job (Ask
// Radian, Explain, Next Steps, Research, Boardroom, Simulation, Mentor, Context Pack,
// Horizon, Brief…). Sourced from the persistent Task Center, so it survives reload and the
// Companion panel closing. Per run: feature · source · status · result · timestamp + actions.
const STATUS: Record<TaskStatus, { color: string; label: string }> = {
  queued: { color: "var(--gold)", label: "Queued" },
  running: { color: "var(--gold)", label: "Running" },
  completed: { color: "var(--good)", label: "Completed" },
  fallback: { color: "var(--gold)", label: "Fallback" },
  failed: { color: "var(--risk)", label: "Failed" },
  "budget-limited": { color: "var(--gold)", label: "Budget-limited" },
  skipped: { color: "var(--text-dim)", label: "Skipped" },
};

function focusedTaskId(): string | null {
  const qs = typeof window !== "undefined" ? window.location.search || window.location.hash.replace(/^#[^?]*\??/, "?") : "";
  return new URLSearchParams(qs).get("task");
}

export default function Activity() {
  const { tasks, accept, retry, archive, dismiss } = useTasks();
  const focused = focusedTaskId();

  const running = tasks.filter((t) => !t.archived && !isTerminal(t.status));
  const done = tasks.filter((t) => !t.archived && isTerminal(t.status));
  const archivedItems = tasks.filter((t) => t.archived);

  const Group = ({ title, items }: { title: string; items: Task[] }) => {
    if (items.length === 0) return null;
    return (
      <section className="mt-6">
        <div className="cap-data mb-2" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title} · {items.length}</div>
        {items.sort((a, b) => b.updatedAt - a.updatedAt).map((t) => <Run key={t.id} t={t} focused={t.id === focused} />)}
      </section>
    );
  };

  function Run({ t, focused }: { t: Task; focused: boolean }) {
    const st = STATUS[t.status];
    const ok = t.status === "completed" || t.status === "fallback";
    return (
      <div className="p-3 mb-2" style={{ borderRadius: 10, border: `1px solid ${focused ? "var(--gold-line)" : "var(--line)"}`, background: focused ? "var(--surface-2)" : "var(--surface)" }}>
        <div className="flex items-center gap-2">
          {ok ? <Check size={14} strokeWidth={1.5} style={{ color: "var(--good)" }} />
            : t.status === "failed" ? <AlertTriangle size={14} strokeWidth={1.5} style={{ color: "var(--risk)" }} />
            : <Loader2 size={14} strokeWidth={1.5} className="animate-spin" style={{ color: "var(--gold)" }} />}
          <span className="truncate" style={{ fontSize: 14, color: "var(--text)" }}>{t.label}</span>
          <span className="cap-data ml-auto shrink-0" style={{ color: st.color }}>{st.label}</span>
        </div>
        <div className="cap-data mt-1" style={{ color: "var(--text-dim)" }}>
          {t.feature || t.kind}{t.subjectType ? ` · on ${t.subjectType}` : ""} · {new Date(t.updatedAt).toLocaleString()}
        </div>
        {!isTerminal(t.status) && (
          <div className="mt-2" style={{ height: 3, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
            <div className="skeleton" style={{ height: "100%", width: t.status === "running" ? "66%" : "25%" }} />
          </div>
        )}
        {t.error && <p className="cap-data mt-1" style={{ color: "var(--risk)" }}>{t.error}</p>}
        {t.status === "fallback" && <p className="cap-data mt-1" style={{ color: "var(--gold)" }}>Live model unavailable — answered from your vault.</p>}

        <div className="flex flex-wrap gap-2 mt-2">
          {ok && (t.childNodeId || t.result !== undefined) && (
            <button onClick={() => accept(t.id)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
              <ExternalLink size={12} strokeWidth={1.5} /> View result
            </button>
          )}
          {t.subjectType === "node" && t.subjectId && (
            <Link href={`/atlas?focus=${t.subjectId}`} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
              <FileText size={12} strokeWidth={1.5} /> Open source
            </Link>
          )}
          {t.status === "failed" && (
            <button onClick={() => retry(t.id)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
              <RotateCcw size={12} strokeWidth={1.5} /> Retry
            </button>
          )}
          {!t.archived ? (
            <button onClick={() => archive(t.id)} aria-label="Archive" className="press inline-flex items-center justify-center ml-auto tap-target" style={{ color: "var(--text-dim)" }}><Archive size={14} strokeWidth={1.5} /></button>
          ) : <span className="ml-auto" />}
          <button onClick={() => { if (confirm("Delete this run from your activity? (the result node, if any, stays in your vault)")) dismiss(t.id); }} aria-label="Delete" className="press inline-flex items-center justify-center tap-target" style={{ color: "var(--text-dim)" }}><Trash2 size={14} strokeWidth={1.5} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-12 page-enter">
      <div className="flex items-center gap-2 mb-1">
        <ActivityIcon size={18} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <h1 className="text-xl font-display">AI Activity</h1>
      </div>
      <p className="cap-data mb-2" style={{ color: "var(--text-dim)" }}>every AI run — running · completed · failed · archived</p>
      <Link href="/io" className="tap-row inline-flex items-center gap-1 cap-data" style={{ color: "var(--gold)" }}>Cost &amp; tokens in Settings → API →</Link>

      {tasks.length === 0 ? (
        <div className="text-center" style={{ padding: "var(--s-7) 8px" }}>
          <div style={{ width: 52, height: 52, margin: "0 auto 14px", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gold-soft)", border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            <ActivityIcon size={22} strokeWidth={1.5} />
          </div>
          <h3 className="font-display" style={{ fontSize: "1.0625rem", color: "var(--text)", marginBottom: 6 }}>No AI runs yet</h3>
          <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55 }}>Ask Radian on any node, capture or project — every run lands here and stays, even after reload.</p>
        </div>
      ) : (
        <>
          <Group title="Running" items={running} />
          <Group title="Completed" items={done} />
          <Group title="Archived" items={archivedItems} />
        </>
      )}
    </div>
  );
}
