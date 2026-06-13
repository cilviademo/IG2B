// Living Atlas node states — computed at RENDER TIME from existing data (no model
// calls). Mirrors packages/shared/src/living-os.ts (the PWA is a standalone Vite app
// and can't import the node barrel). Keep the two in sync.

export type NodeState = "critical" | "blocked" | "growing" | "emerging" | "decaying" | "dormant" | "stable";

export interface NodeStateInput {
  mvs: number;
  recencyDays: number;
  inboundBlocked: boolean;
  recentEdges: number;
  degree: number;
  createdDays: number;
  critical?: boolean;
}

export function computeNodeState(i: NodeStateInput): NodeState {
  if (i.critical) return "critical";
  if (i.inboundBlocked) return "blocked";
  if (i.recencyDays <= 14 && i.recentEdges > 0 && i.mvs >= 55) return "growing";
  if (i.createdDays <= 10 && i.degree <= 2) return "emerging";
  if (i.recencyDays >= 45 && i.mvs < 40) return "dormant";
  if (i.recencyDays >= 21 && i.mvs < 60) return "decaying";
  return "stable";
}

export interface NodeStateStyle { ring?: string; glow: number; pulse: boolean; dim: number; badge?: string; label: string }
export const NODE_STATE_STYLE: Record<NodeState, NodeStateStyle> = {
  critical: { ring: "#C25450", glow: 0.5, pulse: true, dim: 1, badge: "!", label: "Critical" },
  blocked: { ring: "#C25450", glow: 0, pulse: false, dim: 0.85, badge: "⊘", label: "Blocked" },
  growing: { ring: "#4FA08B", glow: 0.4, pulse: true, dim: 1, label: "Growing" },
  emerging: { ring: "#C9A45C", glow: 0.25, pulse: false, dim: 1, label: "Emerging" },
  decaying: { glow: 0, pulse: false, dim: 0.6, label: "Decaying" },
  dormant: { glow: 0, pulse: false, dim: 0.4, label: "Dormant" },
  stable: { glow: 0, pulse: false, dim: 1, label: "Stable" },
};

// The 6 named states (excludes "stable") for the legend.
export const LEGEND: NodeState[] = ["growing", "emerging", "blocked", "critical", "decaying", "dormant"];

const days = (iso?: string, now = Date.now()) => (iso ? (now - new Date(iso).getTime()) / 86400000 : 999);

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
