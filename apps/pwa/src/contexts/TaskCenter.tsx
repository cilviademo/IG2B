import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";

// Task Center (G-UX) — runs actions in the background and notifies in-app when ready.
// Trigger an action via `runTask`; its promise lives HERE (App-level), so navigating
// between tabs never cancels it. When it resolves we surface a toast (View / Snooze); a
// snoozed/unseen task leaves a notification bubble on its tab until you visit it.

export interface Task {
  id: string;
  label: string;
  tab: string;                 // route where the result is viewed (also the badge target)
  kind: string;                // action type (so actions sharing a tab don't conflate)
  status: "running" | "ready" | "snoozed" | "error";
  result?: unknown;
  error?: string;
  seen: boolean;
  createdAt: number;
}

interface TaskCtx {
  tasks: Task[];
  runTask: (o: { label: string; tab: string; kind: string; run: () => Promise<unknown> }) => string;
  accept: (id: string) => void;
  snooze: (id: string) => void;
  dismiss: (id: string) => void;
  latest: (tab: string, kind?: string) => Task | undefined;  // newest task with a result
  badge: (tab: string) => number;             // unseen ready/snoozed count (0 on the active tab)
  toastTask: () => Task | undefined;          // the ready task to surface (off the active tab)
}

const Ctx = createContext<TaskCtx | null>(null);
export function useTasks(): TaskCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTasks must be used within <TaskProvider>");
  return c;
}

let seq = 0;

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [location, navigate] = useLocation();

  const patch = useCallback((id: string, p: Partial<Task>) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t))), []);

  const runTask = useCallback((o: { label: string; tab: string; kind: string; run: () => Promise<unknown> }) => {
    const id = `task_${Date.now()}_${seq++}`;
    setTasks((ts) => [...ts, { id, label: o.label, tab: o.tab, kind: o.kind, status: "running", seen: false, createdAt: Date.now() }]);
    // The promise is owned by the provider — independent of the component that started it.
    Promise.resolve().then(o.run)
      .then((r) => patch(id, { status: "ready", result: r }))
      .catch((e) => patch(id, { status: "error", error: String((e as Error)?.message || e) }));
    return id;
  }, [patch]);

  const accept = useCallback((id: string) => {
    const t = tasks.find((x) => x.id === id);
    patch(id, { seen: true });
    if (t) navigate(t.tab);
  }, [tasks, patch, navigate]);

  const snooze = useCallback((id: string) => patch(id, { status: "snoozed" }), [patch]);
  const dismiss = useCallback((id: string) => patch(id, { seen: true }), [patch]);

  // Visiting a tab clears its notifications.
  useEffect(() => {
    setTasks((ts) => ts.map((t) => (t.tab === location && !t.seen ? { ...t, seen: true } : t)));
  }, [location]);

  const latest = useCallback((tab: string, kind?: string) => tasks.filter((t) => t.tab === tab && (kind ? t.kind === kind : true) && t.result !== undefined).sort((a, b) => b.createdAt - a.createdAt)[0], [tasks]);
  const badge = useCallback((tab: string) => (tab === location ? 0 : tasks.filter((t) => t.tab === tab && !t.seen && (t.status === "ready" || t.status === "snoozed" || t.status === "error")).length), [tasks, location]);
  const toastTask = useCallback(() => tasks.filter((t) => t.status === "ready" && !t.seen && t.tab !== location).sort((a, b) => b.createdAt - a.createdAt)[0], [tasks, location]);

  return <Ctx.Provider value={{ tasks, runTask, accept, snooze, dismiss, latest, badge, toastTask }}>{children}</Ctx.Provider>;
}

// Convenience for any action: run it in the background (survives navigation), with the
// result read back from the Task Center. `busy` reflects an in-flight run of this kind on
// this tab; `result` is the latest completed result; `status` the latest task's status.
export function useTaskAction<R = unknown>(kind: string, tab: string) {
  const { runTask, tasks, latest } = useTasks();
  const busy = tasks.some((t) => t.kind === kind && t.tab === tab && t.status === "running");
  const task = latest(tab, kind);
  const start = useCallback((label: string, run: () => Promise<R>) => runTask({ kind, tab, label, run }), [runTask, kind, tab]);
  return { start, busy, result: task?.result as R | undefined, status: task?.status, error: task?.error };
}
