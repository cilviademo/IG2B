// Living OS (Wave G1) — pure logic for the Companion Panel verb router + the
// Living Atlas node states. No model calls here; node state is computed at render
// time from data the PWA already has. Backend orchestration + UI ride on this.

// ---- Companion Panel verbs ----
export type AskVerb =
  | "explain" | "teach" | "next_steps" | "research" | "simulate" | "challenge" | "create_task" | "context_pack" | "ask";

export interface VerbSpec {
  verb: AskVerb;
  label: string;
  // How the backend fulfils it: an existing job type, or a synchronous action.
  fulfilment: { kind: "job"; job: "ask" | "assist" | "research" | "simulation" | "context_pack" } | { kind: "sync"; action: "create_task" };
  // Which entity types it applies to (the panel filters by this).
  on: ("node" | "project" | "brief" | "capture")[];
}

// Each verb maps to an EXISTING system (assistance/research/Oracle/Encompass) — the
// panel is orchestration, not new intelligence.
export const VERBS: VerbSpec[] = [
  { verb: "explain", label: "Explain", fulfilment: { kind: "job", job: "ask" }, on: ["node", "project", "brief", "capture"] },
  { verb: "teach", label: "Teach me", fulfilment: { kind: "job", job: "ask" }, on: ["node", "project", "brief", "capture"] },
  { verb: "next_steps", label: "Next steps", fulfilment: { kind: "job", job: "assist" }, on: ["node", "project", "capture"] },
  { verb: "research", label: "Research this", fulfilment: { kind: "job", job: "research" }, on: ["node", "project", "capture"] },
  { verb: "simulate", label: "Simulate", fulfilment: { kind: "job", job: "simulation" }, on: ["node", "project"] },
  { verb: "challenge", label: "Challenge this", fulfilment: { kind: "job", job: "ask" }, on: ["node", "project", "brief", "capture"] },
  { verb: "create_task", label: "Create task", fulfilment: { kind: "sync", action: "create_task" }, on: ["node", "project", "capture"] },
  { verb: "context_pack", label: "Context pack", fulfilment: { kind: "job", job: "context_pack" }, on: ["node", "project"] },
];

export function verbsFor(entity: "node" | "project" | "brief" | "capture"): VerbSpec[] {
  return VERBS.filter((v) => v.on.includes(entity));
}
export function findVerb(verb: string): VerbSpec | undefined {
  return VERBS.find((v) => v.verb === verb);
}

// ---- Living Atlas node states ----
// Computed at render time from existing data — zero model calls. Priority order
// matters: the first matching state wins.
export type NodeState = "critical" | "legendary" | "blocked" | "growing" | "emerging" | "decaying" | "dormant" | "stable";
export const NODE_STATES: NodeState[] = ["critical", "legendary", "blocked", "growing", "emerging", "decaying", "dormant", "stable"];

export interface NodeStateInput {
  mvs: number;
  recencyDays: number; // days since updated
  inboundBlocked: boolean; // an inbound `blocks` edge
  recentEdges: number; // edges formed in the last ~14d (momentum)
  degree: number;
  createdDays: number; // age of the node
  critical?: boolean; // deadline/constraint violation flagged upstream
  legendary?: boolean; // explicit core-memory cornerstone
}

export function computeNodeState(i: NodeStateInput): NodeState {
  if (i.critical) return "critical";
  if (i.inboundBlocked) return "blocked";
  // G8 Memory Palace — Legendary: a cornerstone (very high value + richly connected, or
  // explicit core memory). The brightest, rarest state.
  if (i.legendary || (i.mvs >= 88 && i.degree >= 5)) return "legendary";
  if (i.recencyDays <= 14 && i.recentEdges > 0 && i.mvs >= 55) return "growing";
  if (i.createdDays <= 10 && i.degree <= 2) return "emerging";
  if (i.recencyDays >= 45 && i.mvs < 40) return "dormant";
  if (i.recencyDays >= 21 && i.mvs < 60) return "decaying";
  return "stable";
}

// Visual encoding within the Vault constellation language. Legendary/growing/critical
// pulse (opacity breathing). reduced-motion disables all pulses (the renderer guards).
export interface NodeStateStyle { ring?: string; glow?: number; pulse: boolean; dim: number; badge?: string; label: string }
export const NODE_STATE_STYLE: Record<NodeState, NodeStateStyle> = {
  critical: { ring: "#C25450", glow: 0.5, pulse: true, dim: 1, badge: "!", label: "Critical — deadline/constraint" },
  legendary: { ring: "#E6C76E", glow: 0.65, pulse: true, dim: 1, badge: "★", label: "Legendary — cornerstone" },
  blocked: { ring: "#C25450", glow: 0, pulse: false, dim: 0.85, badge: "⊘", label: "Blocked — inbound blocker" },
  growing: { ring: "#4FA08B", glow: 0.4, pulse: true, dim: 1, label: "Growing — recent momentum" },
  emerging: { ring: "#C9A45C", glow: 0.25, pulse: false, dim: 1, label: "Emerging — new cluster" },
  decaying: { ring: undefined, glow: 0, pulse: false, dim: 0.6, label: "Decaying — fading value" },
  dormant: { ring: undefined, glow: 0, pulse: false, dim: 0.4, label: "Dormant — untouched, low value" },
  stable: { ring: undefined, glow: 0, pulse: false, dim: 1, label: "Stable" },
};

// G8 overlays (derived flags, not primary states).
export const isForgottenGem = (mvs: number, recencyDays: number) => mvs >= 70 && recencyDays >= 45;
export const isResurfaced = (createdDays: number, recencyDays: number) => createdDays >= 60 && recencyDays <= 10;

// ---- Sprint 6: Atlas evolution — memory matures with age (derived overlay, NOT a state) ----
// Memory has a lifecycle independent of value/momentum: fresh ideas, ideas that have settled,
// and long-held memories that have proven durable. This rides ON TOP of NodeState as a subtle
// patina the renderer draws after the rings, so it never disturbs the state machine (or its
// pulse-set tests). The Atlas thus visibly *evolves* as the vault ages.
export type MemoryAgeTier = "fresh" | "forming" | "established" | "enduring";
export function memoryTier(createdDays: number): MemoryAgeTier {
  if (createdDays < 14) return "fresh";
  if (createdDays < 60) return "forming";
  if (createdDays < 180) return "established";
  return "enduring";
}
// A crystallized memory: enduring AND still valuable AND woven into the graph — a memory that
// has stood the test of time (distinct from Legendary, which is value+degree regardless of age).
export const isCrystallized = (i: { createdDays: number; mvs: number; degree: number }) =>
  i.createdDays >= 180 && i.mvs >= 70 && i.degree >= 3;
// Patina ring colour per tier (deepens as memory matures); undefined = no patina drawn.
export const MEMORY_TIER_PATINA: Record<MemoryAgeTier, string | undefined> = {
  fresh: undefined,
  forming: undefined,
  established: "rgba(201,164,92,0.28)", // faint aged gold
  enduring: "rgba(230,199,110,0.5)",    // deeper crystalline gold
};
