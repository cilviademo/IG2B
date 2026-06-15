// Living Atlas node states — computed at RENDER TIME from existing data (no model
// calls). Mirrors packages/shared/src/living-os.ts (the PWA is a standalone Vite app
// and can't import the node barrel). Keep the two in sync.

export type NodeState = "critical" | "legendary" | "blocked" | "growing" | "emerging" | "decaying" | "dormant" | "stable";

export interface NodeStateInput {
  mvs: number;
  recencyDays: number;
  inboundBlocked: boolean;
  recentEdges: number;
  degree: number;
  createdDays: number;
  critical?: boolean;
  legendary?: boolean;
}

export function computeNodeState(i: NodeStateInput): NodeState {
  if (i.critical) return "critical";
  if (i.inboundBlocked) return "blocked";
  // Legendary — a cornerstone of the vault: very high value + richly connected (or
  // explicitly core memory). The brightest, rarest state.
  if (i.legendary || (i.mvs >= 88 && i.degree >= 5)) return "legendary";
  if (i.recencyDays <= 14 && i.recentEdges > 0 && i.mvs >= 55) return "growing";
  if (i.createdDays <= 10 && i.degree <= 2) return "emerging";
  if (i.recencyDays >= 45 && i.mvs < 40) return "dormant";
  if (i.recencyDays >= 21 && i.mvs < 60) return "decaying";
  return "stable";
}

export interface NodeStateStyle { ring?: string; glow: number; pulse: boolean; dim: number; badge?: string; label: string }
export const NODE_STATE_STYLE: Record<NodeState, NodeStateStyle> = {
  critical: { ring: "#C25450", glow: 0.5, pulse: true, dim: 1, badge: "!", label: "Critical" },
  legendary: { ring: "#E6C76E", glow: 0.65, pulse: true, dim: 1, badge: "★", label: "Legendary" },
  blocked: { ring: "#C25450", glow: 0, pulse: false, dim: 0.85, badge: "⊘", label: "Blocked" },
  growing: { ring: "#4FA08B", glow: 0.4, pulse: true, dim: 1, label: "Growing" },
  emerging: { ring: "#C9A45C", glow: 0.25, pulse: false, dim: 1, label: "Emerging" },
  decaying: { glow: 0, pulse: false, dim: 0.6, label: "Decaying" },
  dormant: { glow: 0, pulse: false, dim: 0.4, label: "Dormant" },
  stable: { glow: 0, pulse: false, dim: 1, label: "Stable" },
};

// Named states (excludes "stable") for the legend.
export const LEGEND: NodeState[] = ["legendary", "growing", "emerging", "blocked", "critical", "decaying", "dormant"];

// G8 Memory Palace overlays (derived flags, not primary states):
// a forgotten gem = high value gone quiet; resurfaced = an old idea freshly touched.
export const isForgottenGem = (mvs: number, recencyDays: number) => mvs >= 70 && recencyDays >= 45;
export const isResurfaced = (createdDays: number, recencyDays: number) => createdDays >= 60 && recencyDays <= 10;

// Sprint 6 — Atlas evolution: memory matures with age (overlay, NOT a state). Mirrors
// packages/shared/src/living-os.ts. The renderer draws a subtle patina AFTER the rings, so
// the constellation visibly evolves as the vault ages — without touching the state machine.
export type MemoryTier = "fresh" | "forming" | "established" | "enduring";
export function memoryTier(createdDays: number): MemoryTier {
  if (createdDays < 14) return "fresh";
  if (createdDays < 60) return "forming";
  if (createdDays < 180) return "established";
  return "enduring";
}
export const isCrystallized = (i: { createdDays: number; mvs: number; degree: number }) =>
  i.createdDays >= 180 && i.mvs >= 70 && i.degree >= 3;
export const MEMORY_TIER_PATINA: Record<MemoryTier, string | undefined> = {
  fresh: undefined, forming: undefined,
  established: "rgba(201,164,92,0.28)", enduring: "rgba(230,199,110,0.5)",
};

const days = (iso?: string, now = Date.now()) => (iso ? (now - new Date(iso).getTime()) / 86400000 : 999);

/** Derive the memory-age overlay (tier + crystallized + patina ring colour) for a node. */
export function deriveMemory(
  node: { id: string; mvs: number; created_at?: string },
  edges: { source_id: string; target_id: string }[],
  now = Date.now(),
): { tier: MemoryTier; crystallized: boolean; patina?: string } {
  let degree = 0;
  for (const e of edges) if (e.source_id === node.id || e.target_id === node.id) degree++;
  const createdDays = days(node.created_at, now);
  const tier = memoryTier(createdDays);
  return { tier, crystallized: isCrystallized({ createdDays, mvs: node.mvs, degree }), patina: MEMORY_TIER_PATINA[tier] };
}

/** Derive a node's state from the graph the Atlas already holds (nodes + edges). */
export function deriveNodeState(
  node: { id: string; mvs: number; created_at?: string; updated_at?: string },
  edges: { source_id: string; target_id: string; relationship: string; valid_from?: string }[],
  now = Date.now(),
): NodeState {
  let inboundBlocked = false;
  let degree = 0;
  let recentEdges = 0;
  for (const e of edges) {
    const touches = e.source_id === node.id || e.target_id === node.id;
    if (!touches) continue;
    degree++;
    if (e.target_id === node.id && /block/i.test(e.relationship)) inboundBlocked = true;
    if (days(e.valid_from, now) <= 14) recentEdges++;
  }
  return computeNodeState({
    mvs: node.mvs,
    recencyDays: days(node.updated_at, now),
    inboundBlocked,
    recentEdges,
    degree,
    createdDays: days(node.created_at, now),
  });
}
