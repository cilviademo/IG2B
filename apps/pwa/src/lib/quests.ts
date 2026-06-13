// Living OS (Wave G3) Quest core — MIRROR of packages/shared/src/quests.ts
// (the PWA is a standalone Vite app and cannot import the @indigold/shared node barrel).
// Pure + deterministic. Keep in sync.

export type QuestKind = "main" | "side" | "research" | "maintenance";
export type QuestState = "suggested" | "accepted" | "active" | "blocked" | "completed" | "archived";
export type QuestSource =
  | "brief" | "node" | "capture" | "time_machine" | "companion"
  | "project" | "inbox" | "review" | "onboarding" | "system";

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

// ---- UI bucketing: every quest maps to EXACTLY ONE Mission Control section, so a
// card visibly moves the instant its state/snooze/project changes. Priority order
// matters (completed > converted > snoozed > blocked > active > suggested). ----
export type QuestBucket = "suggested" | "active" | "snoozed" | "blocked" | "completed" | "converted";
export function questBucket(
  q: { state: string; project_id?: string | null; snooze_until?: string | null },
  now = Date.now(),
): QuestBucket | null {
  if (q.state === "archived") return null;
  if (q.state === "completed") return "completed";
  if (q.project_id) return "converted";
  if (q.snooze_until && new Date(q.snooze_until).getTime() > now) return "snoozed";
  if (q.state === "blocked") return "blocked";
  if (q.state === "accepted" || q.state === "active") return "active";
  if (q.state === "suggested") return "suggested";
  return null;
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

// ---- deterministic bulk suggestion from REAL (often sparse) vault data (no LLM) ----
// Pulls from every signal a vault can have early on: inbox backlog, brief / recommended
// focus, review queue, high-value nodes, Time Machine resurfaced + forgotten gems, and
// active projects. If NOTHING is generatable, falls back to safe onboarding quests so
// the surface is never empty. Never reads sample/demo data — the API passes live rows.
export interface SuggestInput {
  inboxCount?: number;
  reviewCount?: number;
  recommendedFocus?: { text: string; priority?: string }[];
  briefId?: string;
  topNodes?: { id: string; title: string; summary?: string; mvs: number }[];
  forgottenGems?: { id: string; title: string; summary?: string }[];
  resurfacedThemes?: string[];
  activeProjects?: { id: string; name: string }[];
  blockedNodes?: { id: string; title: string; summary?: string }[];
  hasDecisions?: boolean;
  hasContextPacks?: boolean;
}

function onboardingSeeds(input: SuggestInput): QuestSeed[] {
  const top = input.topNodes?.[0];
  const seeds: QuestSeed[] = [
    { title: "Triage your inbox", summary: "Clear and classify your captured items.", kind: "maintenance", source_type: "onboarding", meta: { onboarding: "triage_inbox" } },
    top
      ? { title: `Review your top node: ${clip(top.title, 50)}`, summary: "Revisit your highest-value memory and decide its next step.", kind: "main", source_type: "onboarding", source_id: top.id, node_id: top.id, meta: { onboarding: "review_top_node" } }
      : { title: "Add your first knowledge node", summary: "Capture or promote something worth remembering.", kind: "main", source_type: "onboarding", meta: { onboarding: "first_node" } },
    { title: "Log your first decision", summary: "Record a decision with confidence + expected outcome so Radian can calibrate you.", kind: "side", source_type: "onboarding", meta: { onboarding: "first_decision" } },
    { title: "Build your first context pack", summary: "Assemble a reusable briefing from your vault.", kind: "research", source_type: "onboarding", meta: { onboarding: "first_context_pack" } },
    { title: "Run a Time Machine replay", summary: "See what you were thinking and what changed.", kind: "maintenance", source_type: "onboarding", meta: { onboarding: "time_machine" } },
  ];
  return seeds;
}

export function suggestQuests(input: SuggestInput): QuestSeed[] {
  const out: QuestSeed[] = [];

  // 1) Inbox backlog → a triage upkeep quest.
  if ((input.inboxCount || 0) > 0) {
    const n = input.inboxCount!;
    out.push({ title: `Triage ${n} ${n === 1 ? "capture" : "captures"} in the inbox`, summary: "Classify and file new captures.", kind: "maintenance", source_type: "inbox", meta: { count: n } });
  }
  // 2) Mission Control recommended focus / brief actions.
  for (const a of input.recommendedFocus || []) out.push(questFromBriefAction(a, input.briefId || "brief"));
  // 3) Review queue → a clear-the-queue upkeep quest.
  if ((input.reviewCount || 0) > 0) {
    const n = input.reviewCount!;
    out.push({ title: `Clear ${n} ${n === 1 ? "item" : "items"} from the review queue`, summary: "Accept, reject or defer items awaiting your call.", kind: "maintenance", source_type: "review", meta: { count: n } });
  }
  // 4) High-value nodes → advance the best ones (top 3, mvs >= 55).
  for (const node of (input.topNodes || []).filter((n) => n.mvs >= 55).slice(0, 3)) {
    out.push({ title: clip(`Advance: ${node.title}`), summary: node.summary || `Push your high-value node "${node.title}" forward.`, kind: node.mvs >= 80 ? "main" : "side", source_type: "node", source_id: node.id, node_id: node.id, meta: { mvs: node.mvs } });
  }
  // 5) Time Machine — forgotten gems + resurfaced themes.
  for (const g of input.forgottenGems || []) out.push(questFromNode(g, "Revisit"));
  for (const theme of (input.resurfacedThemes || []).slice(0, 2)) {
    out.push({ title: clip(`Reconnect with "${theme}"`), summary: `This theme resurfaced after a quiet spell.`, kind: "side", source_type: "time_machine", meta: { theme } });
  }
  // 6) Active projects → push forward (top 3) — works with zero AI.
  for (const p of (input.activeProjects || []).slice(0, 3)) {
    out.push({ title: clip(`Push "${p.name}" forward`), summary: `Make progress on an active project.`, kind: "main", source_type: "project", source_id: p.id, meta: { project_id: p.id } });
  }
  // 7) Blocked nodes → unblock.
  for (const b of input.blockedNodes || []) out.push(questFromNode(b, "Unblock"));

  // 8) Gentle, always-useful nudges when the journal/context-pack features are unused.
  if (input.hasDecisions === false) out.push({ title: "Log your first decision", summary: "Record a decision so Radian can calibrate your judgment over time.", kind: "side", source_type: "onboarding", meta: { onboarding: "first_decision" } });
  if (input.hasContextPacks === false) out.push({ title: "Build your first context pack", summary: "Assemble a reusable briefing from your vault.", kind: "research", source_type: "onboarding", meta: { onboarding: "first_context_pack" } });

  // de-dupe by title
  const seen = new Set<string>();
  const deduped = out.filter((q) => (seen.has(q.title) ? false : (seen.add(q.title), true)));

  // 9) If we still have nothing, seed safe onboarding quests so it's never empty.
  return deduped.length ? deduped.slice(0, 12) : onboardingSeeds(input);
}
