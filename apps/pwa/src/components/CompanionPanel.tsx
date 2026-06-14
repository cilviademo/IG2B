import { useState } from "react";
import { Link } from "wouter";
import { Sparkles, Loader2, Check, AlertTriangle, Users, ExternalLink, RotateCcw } from "lucide-react";
import Sheet from "./Sheet";
import { Button, Dot } from "./primitives";
import { askRadian, conveneBoardroom, type BoardroomSynthesis } from "@/lib/api";
import BoardroomView from "./BoardroomView";
import { useTasks } from "@/contexts/TaskCenter";

// "Ask Radian" — the Companion Panel. Orchestration only: every verb maps to an
// existing governed backend job; the frontend makes NO direct model calls and shows
// honest job state (queued/running/completed/failed/budget-limited/fallback/skipped).
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

export default function CompanionPanel({
  subjectType, subjectId, title, onClose,
}: { subjectType: Entity; subjectId: string; title: string; onClose: () => void }) {
  const [running, setRunning] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<"ok" | "err" | null>(null);
  const [question, setQuestion] = useState("");
  const [board, setBoard] = useState<{ synthesis: BoardroomSynthesis; node: string } | null>(null);
  const [boardBusy, setBoardBusy] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const { runTask, trackJob, tasks, retry } = useTasks();
  // The live task for THIS panel session — shows inline status while the sheet is open.
  const active = activeTaskId ? tasks.find((t) => t.id === activeTaskId) : undefined;

  async function convene() {
    if (boardBusy) return;
    setBoardBusy(true); setBoard(null);
    // Track the boardroom run so it's recoverable from the Task Center too.
    runTask({ kind: "boardroom", feature: "Boardroom", tab: "/atlas", label: `Boardroom — ${title}`, subjectType, subjectId, run: async () => conveneBoardroom(subjectType, subjectId, question.trim() || undefined) });
    const r = await conveneBoardroom(subjectType, subjectId, question.trim() || undefined);
    if (!r) setStatus("couldn't reach the Boardroom (offline or API asleep)");
    setBoard(r);
    setBoardBusy(false);
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

      {/* G5 Boardroom — the multi-agent council. Synchronous + deterministic; renders the
          six-persona synthesis inline. */}
      <Button variant="primary" full disabled={boardBusy} onClick={() => void convene()} style={{ marginBottom: 8 }}>
        {boardBusy ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : <Users size={14} strokeWidth={1.5} />} Convene Boardroom
      </Button>
      {board && <BoardroomView synthesis={board.synthesis} nodeId={subjectType === "node" ? subjectId : undefined} />}

      <div className="grid grid-cols-2 gap-2 mt-1">
        {verbs.map((v) => (
          <Button key={v.verb} variant="ghost" disabled={!!running} onClick={() => void run(v.verb)}>
            {running === v.verb ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : null} {v.label}
          </Button>
        ))}
      </div>

      <div className="mt-3">
        <label className="block mb-1" style={{ fontSize: 12, color: "var(--text-dim)" }}>Ask Radian about this…</label>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. how does this connect to BTZ?"
            className="flex-1 px-3 py-2.5 text-sm min-w-0"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6 }}
          />
          <Button variant="primary" disabled={!!running || !question.trim()} onClick={() => void run("ask", question.trim())}>Ask</Button>
        </div>
      </div>

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
