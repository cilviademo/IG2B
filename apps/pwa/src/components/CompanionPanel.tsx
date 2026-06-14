import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Sparkles, Loader2, Check, AlertTriangle, Users, ExternalLink, RotateCcw, ArrowUp, SlidersHorizontal } from "lucide-react";
import Sheet from "./Sheet";
import { Button, Dot } from "./primitives";
import { askRadian } from "@/lib/api";
import { useTasks } from "@/contexts/TaskCenter";

// AURORA A4 — "Ask Radian" is now ONE natural-language input. The intent router maps the
// phrasing to the existing verb (explain/challenge/next_steps/research/simulate/…) — the
// engines are unchanged, just invisible. An "Advanced" affordance still exposes explicit
// verbs. Orchestration only: the frontend makes NO direct model calls; honest job state.
type Entity = "node" | "project" | "brief" | "capture";
const VERBS: { verb: string; label: string; on: Entity[] }[] = [
  { verb: "explain", label: "Explain", on: ["node", "project", "brief", "capture"] },
  { verb: "teach", label: "Teach me", on: ["node", "project", "brief", "capture"] },
  { verb: "next_steps", label: "Next steps", on: ["node", "project", "capture"] },
  { verb: "research", label: "Research this", on: ["node", "project", "capture"] },
  { verb: "simulate", label: "Simulate", on: ["node", "project"] },
  { verb: "challenge", label: "Challenge this", on: ["node", "project", "brief", "capture"] },
  { verb: "create_task", label: "Create task", on: ["node", "project", "capture"] },
  { verb: "context_pack", label: "Context pack", on: ["node", "project"] },
];

const FEATURE: Record<string, string> = { explain: "Companion", teach: "Companion", next_steps: "Companion", challenge: "Companion", ask: "Companion", research: "Research", simulate: "Simulation", context_pack: "Context Packs" };

// Deterministic intent router: phrasing → existing verb. Honest + transparent (we show the
// routed verb back to the user). Defaults to a grounded "explain/ask".
function routeIntent(q: string): { verb: string; question?: string } {
  const t = q.toLowerCase();
  if (/\b(argue|against|challenge|critique|devil|risk|why not|wrong|flaw|weak)\b/.test(t)) return { verb: "challenge", question: q };
  if (/\b(teach|learn|eli5|simply|beginner|explain like)\b/.test(t)) return { verb: "teach", question: q };
  if (/\b(next step|what should i|what do i do|plan|how do i start|action)\b/.test(t)) return { verb: "next_steps" };
  if (/\b(research|find|sources?|look up|dig|investigate|prior art)\b/.test(t)) return { verb: "research" };
  if (/\b(what if|simulate|scenario|compare|versus|vs\.?|odds|likely)\b/.test(t)) return { verb: "simulate" };
  if (/\b(context|pack|gather everything|assemble)\b/.test(t)) return { verb: "context_pack" };
  if (/\b(remind me|create task|add task|to-?do)\b/.test(t)) return { verb: "create_task", question: q };
  return { verb: "ask", question: q }; // default: understand / connect / what-is / how
}
const VERB_LABEL: Record<string, string> = { explain: "Understanding", ask: "Answering", teach: "Teaching", next_steps: "Planning next steps", research: "Researching", simulate: "Simulating", challenge: "Challenging", context_pack: "Building context", create_task: "Creating task" };

export default function CompanionPanel({
  subjectType, subjectId, title, onClose,
}: { subjectType: Entity; subjectId: string; title: string; onClose: () => void }) {
  const [running, setRunning] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<"ok" | "err" | null>(null);
  const [question, setQuestion] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { trackJob, tasks, retry } = useTasks();
  // The live task for THIS panel session — shows inline status while the sheet is open.
  const active = activeTaskId ? tasks.find((t) => t.id === activeTaskId) : undefined;

  function openSituationRoom() {
    navigate(`/situation-room?subject_type=${subjectType}&subject_id=${encodeURIComponent(subjectId)}&title=${encodeURIComponent(title)}`);
    onClose();
  }

  // Single natural-language entry: route the phrasing to a verb, then run it.
  function ask() {
    const q = question.trim();
    if (!q || running) return;
    const { verb, question: passedQ } = routeIntent(q);
    void run(verb, passedQ);
  }

  async function run(verb: string, q?: string) {
    setRunning(verb); setDone(null); setStatus("queued…"); setActiveTaskId(null);
    const r = await askRadian(subjectType, subjectId, verb, q);
    if (!r) { setStatus("couldn't reach Radian (offline or API asleep)"); setDone("err"); setRunning(null); return; }
    if (r.mode === "done") { setStatus("✓ task created in your vault"); setDone("ok"); setRunning(null); return; }
    // Hand the job to the Task Center — it persists + polls to completion, so you can
    // close this sheet / switch tabs / reload and still be notified + open the result.
    const tid = trackJob({
      kind: "companion", feature: FEATURE[verb] || "Companion", tab: "/atlas",
      label: `${verb.replace("_", " ")} — ${title}`,
      jobId: r.job!, subjectType, subjectId, verb, question: q,
    });
    setActiveTaskId(tid);
    setRunning(null); setDone("ok");
    setStatus(null);
  }

  const verbs = VERBS.filter((v) => v.on.includes(subjectType));
  return (
    <Sheet title="Ask Radian" onClose={onClose}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        <span className="text-sm" style={{ color: "var(--text)" }}>{title}</span>
        <span className="cap-data ml-auto">{subjectType}</span>
      </div>

      {/* ONE natural-language input — routes to the right verb internally. */}
      <div className="flex gap-2 items-end">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder="Ask anything — “how does this connect to BTZ?”, “argue against this”, “what should I do next?”"
          rows={2}
          className="flex-1 px-3 py-2.5 text-sm min-w-0 resize-none"
          style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8 }}
        />
        <button onClick={ask} disabled={!!running || !question.trim()} aria-label="Ask" className="press flex items-center justify-center shrink-0" style={{ width: 44, height: 44, borderRadius: 999, background: question.trim() && !running ? "var(--gold)" : "var(--surface-2)", color: question.trim() && !running ? "#161118" : "var(--text-dim)", border: "1px solid var(--gold-line)" }}>
          {running ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2} />}
        </button>
      </div>

      {/* Situation Room (the six-persona council) lives on its own screen now (A5). */}
      <button onClick={openSituationRoom} className="press w-full flex items-center justify-center gap-2 mt-2.5 py-2.5 text-xs font-semibold" style={{ borderRadius: 8, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
        <Users size={14} strokeWidth={1.5} /> Open Situation Room
      </button>

      {/* Advanced — explicit verbs, for when you want to be precise. */}
      <button onClick={() => setAdvanced((a) => !a)} className="press inline-flex items-center gap-1.5 mt-3 cap-data" style={{ color: "var(--text-dim)" }}>
        <SlidersHorizontal size={12} strokeWidth={1.5} /> {advanced ? "Hide" : "Advanced"} — pick a verb
      </button>
      {advanced && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {verbs.map((v) => (
            <Button key={v.verb} variant="ghost" disabled={!!running} onClick={() => void run(v.verb, ["explain", "challenge", "teach", "ask"].includes(v.verb) ? question.trim() || undefined : undefined)}>
              {running === v.verb ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : null} {v.label}
            </Button>
          ))}
        </div>
      )}

      {/* Live status for the in-flight verb — updates even as the job runs in the background. */}
      {active && (
        <div className="mt-3 p-2.5" style={{ borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }}>
          <div className="flex items-center gap-2">
            {active.status === "completed" || active.status === "fallback" ? <Check size={14} strokeWidth={1.5} style={{ color: "var(--good)" }} />
              : active.status === "failed" ? <AlertTriangle size={14} strokeWidth={1.5} style={{ color: "var(--risk)" }} />
              : <Dot color="var(--gold)" pulse />}
            <span style={{ fontSize: 13, color: "var(--text)" }}>{active.label}</span>
            <span className="cap-data ml-auto" style={{ color: active.status === "failed" ? "var(--risk)" : active.status === "completed" ? "var(--good)" : active.status === "fallback" ? "var(--gold)" : "var(--text-dim)" }}>{active.status}</span>
          </div>
          {active.error && <p className="cap-data mt-1" style={{ color: "var(--risk)" }}>{active.error}</p>}
          {active.status === "fallback" && <p className="cap-data mt-1" style={{ color: "var(--gold)" }}>Live model unavailable — answered from your vault (deterministic).</p>}
          <div className="flex gap-2 mt-2">
            {active.childNodeId && (isTerminalOk(active.status)) && (
              <Link href={`/atlas?focus=${active.childNodeId}`} onClick={onClose} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
                <ExternalLink size={12} strokeWidth={1.5} /> Open result
              </Link>
            )}
            {active.status === "failed" && (
              <button onClick={() => retry(active.id)} className="press inline-flex items-center gap-1 px-2.5 py-1.5 text-xs" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)" }}>
                <RotateCcw size={12} strokeWidth={1.5} /> Retry
              </button>
            )}
          </div>
          {!isTerminal(active.status) && <p className="cap-data mt-1" style={{ color: "var(--text-dim)" }}>Running in the background — you can close this; you'll be notified when it's ready.</p>}
        </div>
      )}

      {status && !active && (
        <div className="flex items-start gap-2 mt-3">
          <span className="mt-0.5">
            {done === "ok" ? <Check size={14} strokeWidth={1.5} style={{ color: "var(--good)" }} />
              : done === "err" ? <AlertTriangle size={14} strokeWidth={1.5} style={{ color: "var(--risk)" }} />
              : <Dot color="var(--gold)" pulse />}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{status}</span>
        </div>
      )}
      <p className="cap-data mt-3" style={{ color: "var(--text-dim)" }}>
        Runs through Radian/Encompass · results land as child nodes with provenance · no on-device model calls.
      </p>
    </Sheet>
  );
}

function isTerminal(s: string) { return ["completed", "fallback", "failed", "budget-limited", "skipped"].includes(s); }
function isTerminalOk(s: string) { return s === "completed" || s === "fallback"; }
