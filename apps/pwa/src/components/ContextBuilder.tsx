import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { buildContext, apiEnabled, type ContextPlan } from "@/lib/api";
import { useTasks } from "@/contexts/TaskCenter";

// G11 Context Engineering — type a goal, get ONLY the relevant slice of the vault packed
// into a token budget (not the whole graph). Deterministic retrieval; explainable per
// item. This is what makes Indigold's memory targeted rather than a dump.
const KIND_LABEL: Record<string, string> = { node: "Nodes", research: "Research", decision: "Decisions", quest: "Active quests", brief: "Briefs" };

export default function ContextBuilder() {
  const [goal, setGoal] = useState("");
  const { runTask, tasks, latest } = useTasks();

  // The pack runs as a background task in the Task Center — leave this tab and it keeps
  // going; you're notified when ready. The result is read back from the latest task, so
  // it survives navigation away and back.
  const busy = tasks.some((t) => t.tab === "/context" && t.status === "running");
  const done = latest("/context");
  const result = done?.result as { plan?: ContextPlan; semantic_provider?: string } | null | undefined;
  const plan = result?.plan ?? null;
  const provider = result?.semantic_provider ?? "none";

  function run(g: string) {
    if (!g.trim() || busy) return;
    runTask({ label: `Context pack: ${g.trim()}`, tab: "/context", run: () => buildContext(g.trim()) });
  }

  if (!apiEnabled()) return null;
  const pct = plan ? Math.min(100, Math.round((plan.tokensUsed / plan.budget) * 100)) : 0;
  const byId = new Map(plan?.included.map((i) => [i.id, i]) ?? []);

  return (
    <div className="mb-4 p-3.5" style={{ borderRadius: 12, border: "1px solid var(--gold-line)", background: "var(--surface)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Crosshair size={15} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <span className="text-sm font-display" style={{ color: "var(--text)" }}>Goal-scoped context</span>
      </div>
      <div className="flex gap-2">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void run(goal); }}
          placeholder="What are you working on? e.g. Help me build BTZ TRACE"
          className="flex-1 px-3 py-2.5"
          style={{ fontSize: 14, background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6 }}
        />
        <button onClick={() => void run(goal)} disabled={busy || !goal.trim()} className="press px-4 text-sm font-semibold" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)", opacity: busy || !goal.trim() ? 0.5 : 1 }}>
          {busy ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : "Pack"}
        </button>
      </div>

      {plan && (
        <div className="mt-3 animate-fade-in-up">
          {plan.bootstrap ? (
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Nothing relevant enough yet — capture more on this goal, then re-pack.</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-data" style={{ fontSize: 14, color: "var(--text)" }}>{plan.tokensUsed.toLocaleString()} / {plan.budget.toLocaleString()} tok</span>
                <span className="cap-data" style={{ color: "var(--text-dim)" }}>{plan.included.length} sent · {plan.excludedCount} left out</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "var(--surface-2)" }}>
                <div className="h-full bar-fill" style={{ width: `${pct}%`, background: "var(--gold)" }} />
              </div>
              {plan.sections.map((s) => (
                <div key={s.kind} className="mb-2">
                  <div className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>{KIND_LABEL[s.kind] || s.kind} · {s.items.length}</div>
                  {s.items.map((it) => {
                    const c = byId.get(it.id);
                    return (
                      <div key={it.id} className="flex items-center gap-2 py-1" style={{ borderBottom: "1px solid var(--line)" }}>
                        <span className="font-data" style={{ fontSize: 11, color: "var(--gold)", width: 30 }}>{c ? Math.round(c.score * 100) : 0}%</span>
                        <span style={{ fontSize: 13, color: "var(--text)" }}>{it.title}</span>
                        {c && <span className="cap-data ml-auto" style={{ color: "var(--text-dim)" }}>{c.reasons.slice(0, 2).join(" · ")}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className="cap-data mt-1" style={{ color: "var(--text-dim)" }}>Deterministic retrieval · semantic: {provider} · packed for the goal, not the whole vault.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
