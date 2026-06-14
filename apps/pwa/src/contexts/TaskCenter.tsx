import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getJob, askRadian } from "@/lib/api";

// Task Center + Notifications (live-AI stabilization).
// Every AI action becomes a PERSISTENT task record (localStorage) — it survives reload,
// route changes, and the Companion sheet closing. Backend-job tasks store their jobId and
// the provider RESUMES polling on load until the job reaches a terminal state. Completion
// raises a toast (off-tab), a tab badge, and a Notification Center entry with an
// "open result" link back to the child node / originating subject. Nothing silently vanishes.

export type TaskStatus = "queued" | "running" | "completed" | "fallback" | "failed" | "budget-limited" | "skipped";
const TERMINAL: TaskStatus[] = ["completed", "fallback", "failed", "budget-limited", "skipped"];
export const isTerminal = (s: TaskStatus) => TERMINAL.includes(s);

export interface Task {
  id: string;
  kind: string;                 // companion | assist | research | simulate | boardroom | mentor | context | horizon | brief | suggest | upload | sync …
  feature?: string;             // display feature (Companion / Research / …)
  label: string;
  tab: string;                  // route where the result is viewed
  status: TaskStatus;
  jobId?: string;               // backend job id → resume-poll
  subjectType?: string;         // node | capture | project | brief (for retry + open)
  subjectId?: string;
  verb?: string;                // companion verb (for retry)
  question?: string;            // freeform ask (for retry)
  childNodeId?: string;         // result child node (open result)
  result?: unknown;             // raw result for sync read-back (boardroom/simulate/…)
  resultText?: string;          // short summary for the card
  error?: string;               // failure / skip reason
  seen: boolean;                // notification read
  toastShown?: boolean;         // toast already surfaced (don't re-pop)
  archived?: boolean;           // moved to the Archived group in AI Activity
  createdAt: number;
  updatedAt: number;
}

interface TaskCtx {
  tasks: Task[];
  // Backend-job task (Companion verbs): provider polls jobId to completion.
  trackJob: (o: { kind: string; feature?: string; label: string; tab: string; jobId: string; subjectType?: string; subjectId?: string; verb?: string; question?: string }) => string;
  // Synchronous task (deterministic engines): run a promise; result stored for read-back.
  runTask: (o: { label: string; tab: string; kind: string; feature?: string; subjectType?: string; subjectId?: string; run: () => Promise<unknown> }) => string;
  accept: (id: string) => void;          // mark seen + navigate to the result
  snooze: (id: string) => void;          // dismiss the toast, keep the badge
  dismiss: (id: string) => void;         // remove the task entirely
  markSeen: (id: string) => void;
  markAllSeen: () => void;
  clearTerminal: () => void;
  archive: (id: string) => void;
  retry: (id: string) => void;
  latest: (tab: string, kind?: string) => Task | undefined;
  badge: (tab: string) => number;        // unseen terminal for a tab (0 on the active tab)
  unreadCount: () => number;             // all unseen terminal (the bell)
  toastTask: () => Task | undefined;     // a terminal task to pop, off the active tab
}

const Ctx = createContext<TaskCtx | null>(null);
export function useTasks(): TaskCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTasks must be used within <TaskProvider>");
  return c;
}

const STORE = "indigold_tasks_v2";
const MAX = 60;
let seq = 0;

function load(): Task[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "[]") as Task[];
    // A non-terminal SYNC task can't resume (its promise is gone) — mark interrupted.
    return raw.map((t) => (!isTerminal(t.status) && !t.jobId ? { ...t, status: "failed" as TaskStatus, error: "interrupted by reload", updatedAt: Date.now() } : t));
  } catch { return []; }
}

// Map an honest backend job row → a task patch.
function mapJob(j: { status: string; result?: unknown; error?: string | null }): Partial<Task> {
  const r = (j.result || {}) as { child?: string; verb?: string; deterministic?: boolean; pack?: string; analysis?: string };
  if (j.status === "done") {
    return { status: r.deterministic ? "fallback" : "completed", childNodeId: r.child || r.analysis, resultText: r.verb ? `${r.verb.replace("_", " ")} ready` : "Ready", updatedAt: Date.now() };
  }
  if (j.status === "failed") return { status: "failed", error: j.error || "model error", updatedAt: Date.now() };
  if (j.status === "skipped") return { status: "skipped", error: j.error || "skipped", updatedAt: Date.now() };
  if (j.status === "queued" && j.error === "budget_governor") return { status: "budget-limited", error: "budget governor — queued, not spending", updatedAt: Date.now() };
  return { status: "running" };
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(load);
  const [location, navigate] = useLocation();
  // Sync-run closures live here (not serialized) so retry works in-session.
  const runs = useRef<Map<string, () => Promise<unknown>>>(new Map());

  // Persist (trim to MAX newest).
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(tasks.slice(-MAX))); } catch { /* quota */ }
  }, [tasks]);

  const patch = useCallback((id: string, p: Partial<Task>) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t))), []);

  const trackJob = useCallback((o: { kind: string; feature?: string; label: string; tab: string; jobId: string; subjectType?: string; subjectId?: string; verb?: string; question?: string }) => {
    const id = `task_${Date.now()}_${seq++}`;
    setTasks((ts) => [...ts, { id, status: "queued", seen: false, createdAt: Date.now(), updatedAt: Date.now(), ...o }]);
    return id;
  }, []);

  const runTask = useCallback((o: { label: string; tab: string; kind: string; feature?: string; subjectType?: string; subjectId?: string; run: () => Promise<unknown> }) => {
    const id = `task_${Date.now()}_${seq++}`;
    runs.current.set(id, o.run);
    setTasks((ts) => [...ts, { id, status: "running", seen: false, createdAt: Date.now(), updatedAt: Date.now(), kind: o.kind, feature: o.feature, label: o.label, tab: o.tab, subjectType: o.subjectType, subjectId: o.subjectId }]);
    Promise.resolve().then(o.run)
      .then((r) => patch(id, { status: "completed", result: r, resultText: "Ready", updatedAt: Date.now() }))
      .catch((e) => patch(id, { status: "failed", error: String((e as Error)?.message || e), updatedAt: Date.now() }));
    return id;
  }, [patch]);

  // Resume-poll: every 2s, advance any non-terminal job-backed task. Survives navigation
  // and reload (the jobId is persisted; the poll re-attaches here).
  const tasksRef = useRef(tasks); tasksRef.current = tasks;
  useEffect(() => {
    const tick = async () => {
      const live = tasksRef.current.filter((t) => t.jobId && !isTerminal(t.status));
      for (const t of live) {
        // Give up after 6 min so a lost job doesn't poll forever — failed + retryable.
        if (Date.now() - t.createdAt > 6 * 60_000) { patch(t.id, { status: "failed", error: "timed out — check the Debug Console", updatedAt: Date.now() }); continue; }
        const j = await getJob(t.jobId!);
        if (!j) continue;
        const p = mapJob(j);
        if (p.status && p.status !== t.status) patch(t.id, p);
      }
    };
    const iv = setInterval(() => { void tick(); }, 2000);
    void tick();
    return () => clearInterval(iv);
  }, [patch]);

  const accept = useCallback((id: string) => {
    const t = tasksRef.current.find((x) => x.id === id);
    patch(id, { seen: true, toastShown: true });
    if (!t) return;
    // Canonical destination — NEVER generic Home. The created child node on the Atlas,
    // else the originating node, else the AI Activity detail for this run (always meaningful).
    if (t.childNodeId) navigate(`/atlas?focus=${t.childNodeId}`);
    else if (t.subjectType === "node" && t.subjectId) navigate(`/atlas?focus=${t.subjectId}`);
    else navigate(`/activity?task=${id}`);
  }, [patch, navigate]);

  const snooze = useCallback((id: string) => patch(id, { toastShown: true }), [patch]);
  const dismiss = useCallback((id: string) => { runs.current.delete(id); setTasks((ts) => ts.filter((t) => t.id !== id)); }, []);
  const markSeen = useCallback((id: string) => patch(id, { seen: true, toastShown: true }), [patch]);
  const markAllSeen = useCallback(() => setTasks((ts) => ts.map((t) => (isTerminal(t.status) ? { ...t, seen: true, toastShown: true } : t))), []);
  const clearTerminal = useCallback(() => setTasks((ts) => ts.filter((t) => !isTerminal(t.status))), []);
  const archive = useCallback((id: string) => patch(id, { archived: true, seen: true, toastShown: true }), [patch]);

  const retry = useCallback((id: string) => {
    const t = tasksRef.current.find((x) => x.id === id);
    if (!t) return;
    if (t.jobId && t.subjectType && t.subjectId) {
      // Re-issue the original Companion verb → fresh jobId; poller resumes.
      patch(id, { status: "queued", error: undefined, seen: true, toastShown: false, createdAt: Date.now(), updatedAt: Date.now() });
      void askRadian(t.subjectType, t.subjectId, t.verb || "explain", t.question).then((r) => {
        if (r?.job) patch(id, { jobId: r.job });
        else patch(id, { status: "failed", error: "couldn't reach Radian", updatedAt: Date.now() });
      });
    } else {
      const run = runs.current.get(id);
      if (!run) { patch(id, { status: "failed", error: "not retryable after reload", updatedAt: Date.now() }); return; }
      patch(id, { status: "running", error: undefined, seen: true, toastShown: false, updatedAt: Date.now() });
      Promise.resolve().then(run).then((r) => patch(id, { status: "completed", result: r, updatedAt: Date.now() })).catch((e) => patch(id, { status: "failed", error: String((e as Error)?.message || e), updatedAt: Date.now() }));
    }
  }, [patch]);

  // Visiting a tab clears its badge (marks its terminal tasks seen).
  useEffect(() => {
    setTasks((ts) => ts.map((t) => (t.tab === location && !t.seen && isTerminal(t.status) ? { ...t, seen: true } : t)));
  }, [location]);

  const latest = useCallback((tab: string, kind?: string) => tasks.filter((t) => t.tab === tab && (kind ? t.kind === kind : true) && (t.result !== undefined || t.childNodeId)).sort((a, b) => b.updatedAt - a.updatedAt)[0], [tasks]);
  const badge = useCallback((tab: string) => (tab === location ? 0 : tasks.filter((t) => t.tab === tab && !t.seen && !t.archived && isTerminal(t.status)).length), [tasks, location]);
  const unreadCount = useCallback(() => tasks.filter((t) => !t.seen && !t.archived && isTerminal(t.status)).length, [tasks]);
  const toastTask = useCallback(() => tasks.filter((t) => isTerminal(t.status) && !t.toastShown && !t.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0], [tasks]);

  return (
    <Ctx.Provider value={{ tasks, trackJob, runTask, accept, snooze, dismiss, markSeen, markAllSeen, clearTerminal, archive, retry, latest, badge, unreadCount, toastTask }}>
      {children}
    </Ctx.Provider>
  );
}

// Convenience for sync actions: run in the background (survives navigation), read the
// result back from the Task Center. Backward-compatible signature for existing callers.
export function useTaskAction<R = unknown>(kind: string, tab: string) {
  const { runTask, tasks, latest } = useTasks();
  const busy = tasks.some((t) => t.kind === kind && t.tab === tab && (t.status === "running" || t.status === "queued"));
  const task = latest(tab, kind);
  const start = useCallback((label: string, run: () => Promise<R>, extra?: { feature?: string; subjectType?: string; subjectId?: string }) => runTask({ kind, tab, label, run, ...extra }), [runTask, kind, tab]);
  return { start, busy, result: task?.result as R | undefined, status: task?.status, error: task?.error };
}
