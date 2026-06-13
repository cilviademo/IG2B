// Living OS (Wave G3) — Quest / Action System core. PURE + DETERMINISTIC: turns
// insights, brief recommendations, Companion outputs, Time Machine reflections and
// nodes into playable, stateful actions. No model calls — the suggestion builders and
// the state machine are rule-based, so this works identically in stub/live mode.

export type QuestKind = "main" | "side" | "research" | "maintenance";
export type QuestState = "suggested" | "accepted" | "active" | "blocked" | "completed" | "archived";
export type QuestSource = "brief" | "node" | "capture" | "time_machine" | "companion" | "system";

export const QUEST_KINDS: QuestKind[] = ["main", "side", "research", "maintenance"];
export const QUEST_STATES: QuestState[] = ["suggested", "accepted", "active", "blocked", "completed", "archived"];

// A quest is "in play" (counts toward today's load) when accepted or active.
export const isInPlay = (s: QuestState) => s === "accepted" || s === "active";

// ---- state machine ----
export type QuestAction = "accept" | "start" | "block" | "unblock" | "complete" | "archive";
const TRANSITIONS: Record<QuestAction, { from: QuestState[]; to: QuestState }> = {
  accept: { from: ["suggested"], to: "accepted" },
  start: { from: ["accepted"], to: "active" },
  block: { from: ["accepted", "active"], to: "blocked" },
  unblock: { from: ["blocked"], to: "active" },
  complete: { from: ["accepted", "active", "blocked"], to: "completed" },
  archive: { from: ["suggested", "accepted", "active", "blocked", "completed"], to: "archived" },
};
export function canApply(state: QuestState, action: QuestAction): boolean {
  return TRANSITIONS[action]?.from.includes(state) ?? false;
}
/** Returns the next state, or null if the action isn't legal from `state`. */
export function applyAction(state: QuestState, action: QuestAction): QuestState | null {
  return canApply(state, action) ? TRANSITIONS[action].to : null;
}

// ---- visual encoding (color/label only; the PWA picks icons) ----
export const QUEST_KIND_STYLE: Record<QuestKind, { label: string; color: string }> = {
  main: { label: "Main", color: "#C9A45C" },        // gold — flagship work
  side: { label: "Side", color: "#6B7DB3" },        // blue — opportunistic
  research: { label: "Research", color: "#4FA08B" },// green — learn/trace
  maintenance: { label: "Upkeep", color: "#8E929C" },// grey — review/clean
};
export const QUEST_STATE_STYLE: Record<QuestState, { label: string; color: string }> = {
  suggested: { label: "Suggested", color: "#8E929C" },
  accepted: { label: "Accepted", color: "#C9A45C" },
  active: { label: "Active", color: "#4FA08B" },
  blocked: { label: "Blocked", color: "#C25450" },
  completed: { label: "Completed", color: "#4FA08B" },
  archived: { label: "Archived", color: "#8E929C" },
};

// ---- deterministic kind inference from action text ----
export function inferKind(text: string): QuestKind {
  const t = (text || "").toLowerCase();
  if (/\b(research|learn|read|study|investigate|explore|trace|compare)\b/.test(t)) return "research";
  if (/\b(review|clean|tidy|update|archive|prune|maintain|refresh|triage|backfill|organi[sz]e)\b/.test(t)) return "maintenance";
  if (/\b(ship|launch|release|build|flagship|deliver|finish|complete)\b/.test(t)) return "main";
  return "side";
}

// ---- suggestion builders (each returns a seed; the API persists + emits) ----
export interface QuestSeed {
  title: string;
  summary: string;
  kind: QuestKind;
  source_type: QuestSource;
  source_id?: string;
  node_id?: string;
  meta?: Record<string, unknown>;
}
const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function questFromBriefAction(action: { text: string; priority?: string }, briefId: string): QuestSeed {
  return {
    title: clip(action.text), summary: action.text,
    kind: action.priority === "high" ? "main" : inferKind(action.text),
    source_type: "brief", source_id: briefId, meta: { priority: action.priority || "medium" },
  };
}
export function questFromNode(node: { id: string; title: string; summary?: string }, reason: string): QuestSeed {
  return {
    title: clip(`${reason}: ${node.title}`), summary: node.summary || reason,
    kind: inferKind(reason), source_type: "node", source_id: node.id, node_id: node.id, meta: { reason },
  };
}
export function questFromCapture(cap: { id: string; title?: string }): QuestSeed {
  const t = cap.title || "Capture";
  return { title: clip(`Act on: ${t}`), summary: t, kind: inferKind(t), source_type: "capture", source_id: cap.id };
}
export function questFromTimeMachine(seed: { kind?: QuestKind; title: string; summary?: string; node_id?: string; reason?: string }): QuestSeed {
  return {
    title: clip(seed.title), summary: seed.summary || seed.title,
    kind: seed.kind || "maintenance", source_type: "time_machine", source_id: seed.node_id, node_id: seed.node_id,
    meta: { reason: seed.reason || "resurfaced" },
  };
}
export function questFromCompanion(c: { node_id: string; verb: string; title: string }): QuestSeed {
  return {
    title: clip(`Follow up: ${c.title}`), summary: `From Companion (${c.verb})`,
    kind: c.verb === "research" ? "research" : "side", source_type: "companion", source_id: c.node_id, node_id: c.node_id, meta: { verb: c.verb },
  };
}

// ---- deterministic bulk suggestion from existing data (no LLM) ----
export interface SuggestInput {
  briefActions?: { text: string; priority?: string }[];
  briefId?: string;
  forgottenGems?: { id: string; title: string; summary?: string }[];
  blockedNodes?: { id: string; title: string; summary?: string }[];
}
export function suggestQuests(input: SuggestInput): QuestSeed[] {
  const out: QuestSeed[] = [];
  for (const a of input.briefActions || []) out.push(questFromBriefAction(a, input.briefId || "brief"));
  for (const g of input.forgottenGems || []) out.push(questFromNode(g, "Revisit"));
  for (const b of input.blockedNodes || []) out.push(questFromNode(b, "Unblock"));
  // de-dupe by title
  const seen = new Set<string>();
  return out.filter((q) => (seen.has(q.title) ? false : (seen.add(q.title), true)));
}
