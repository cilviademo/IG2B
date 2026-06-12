// RADIAN pipeline stages 7–9 — pure logic + parsers (stub + live-fallback).
// Stage 7 Opportunity detection, Stage 8 Decision calibration, Stage 9 Memory
// consolidation. Provider-agnostic; no DB, no node-only deps.

import type { GraphNode } from "./types";
import type { Leverage } from "./radian-stages2";

// ---- Stage 7: Opportunity Detection ----
export interface Opportunity {
  thesis: string;
  contributing_nodes: string[]; // provenance
  confidence: number;
  leverage: Leverage;
  first_move: string;
  decay_days: number;
}

interface NodeWithMeta extends GraphNode {
  meta?: { project_relevance?: { registry_id: string; relevance: number }[] };
}

/** Deterministic Stage 7 — cross-domain intersections: nodes relevant to >=2
 *  projects are "bridges"; high-value bridges become Opportunity proposals. */
export function detectOpportunities(nodes: NodeWithMeta[], projects: { id: string; name: string }[]): Opportunity[] {
  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  const bridges: { node: NodeWithMeta; projs: string[]; score: number }[] = [];
  for (const n of nodes) {
    const rel = (n.meta?.project_relevance || []).filter((r) => r.relevance >= 0.4);
    const projs = [...new Set(rel.map((r) => r.registry_id))];
    if (projs.length >= 2) {
      const score = n.mvs * rel.reduce((s, r) => s + r.relevance, 0);
      bridges.push({ node: n, projs, score });
    }
  }
  bridges.sort((a, b) => b.score - a.score);
  return bridges.slice(0, 3).map((b) => {
    const names = b.projs.map((id) => nameOf.get(id) || id);
    const leverage: Leverage = b.score > 120 ? "HIGH" : b.score > 70 ? "MED" : "LOW";
    return {
      thesis: `"${b.node.title}" bridges ${names.join(" + ")} — a cross-domain leverage point.`,
      contributing_nodes: [b.node.id],
      confidence: Math.min(0.9, 0.4 + b.projs.length * 0.15),
      leverage,
      first_move: `Spend one session connecting "${b.node.title}" across ${names.slice(0, 2).join(" and ")}.`,
      decay_days: 30,
    };
  });
}

export function parseOpportunities(text: string, validNodeIds: Set<string>): Opportunity[] | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const arr = Array.isArray(j.opportunities) ? j.opportunities : null;
    if (!arr) return null;
    const lev = ["LOW", "MED", "HIGH"];
    return (arr as Record<string, unknown>[]).map((o) => ({
      thesis: String(o.thesis || ""),
      contributing_nodes: (Array.isArray(o.contributing_nodes) ? o.contributing_nodes.map(String) : []).filter((x: string) => validNodeIds.has(x)),
      confidence: Math.max(0, Math.min(1, Number(o.confidence ?? 0.5))),
      leverage: (lev.includes(String(o.leverage)) ? String(o.leverage) : "MED") as Leverage,
      first_move: String(o.first_move || ""),
      decay_days: Math.max(1, Math.min(180, Number(o.decay_days ?? 30))),
    })).filter((o) => o.thesis);
  } catch {
    return null;
  }
}

// ---- Stage 8: Decision calibration ----
export interface CalibrationSummary {
  n: number;
  avg_confidence: number;
  success_rate: number;
  gap: number; // avg_confidence - success_rate ; >0 = overconfident
  note: string;
}
export function calibrate(decisions: { confidence: number; outcome_success: boolean | null }[]): CalibrationSummary {
  const done = decisions.filter((d) => d.outcome_success !== null);
  if (!done.length) return { n: 0, avg_confidence: 0, success_rate: 0, gap: 0, note: "No reviewed decisions yet." };
  const avg = done.reduce((s, d) => s + d.confidence, 0) / done.length;
  const succ = done.filter((d) => d.outcome_success).length / done.length;
  const gap = avg - succ;
  const note = Math.abs(gap) < 0.1 ? "Well calibrated." : gap > 0 ? "Overconfident — discount stated confidence." : "Underconfident — trust your judgment more.";
  return { n: done.length, avg_confidence: Number(avg.toFixed(2)), success_rate: Number(succ.toFixed(2)), gap: Number(gap.toFixed(2)), note };
}

// ---- Stage 9: Memory Consolidation ----
export interface MvsAdjustment { id: string; before: number; after: number }
export interface ThemeCluster { tag: string; node_ids: string[] }
export interface ConsolidationResult { adjustments: MvsAdjustment[]; themes: ThemeCluster[] }

const MVS_FLOOR = 10;
/** Nightly: strengthen referenced nodes, decay the rest (never below floor, never
 *  delete), and surface theme clusters (>=3 nodes sharing a tag). Deterministic. */
export function consolidate(nodes: GraphNode[], referencedIds: Set<string>): ConsolidationResult {
  const adjustments: MvsAdjustment[] = [];
  for (const n of nodes) {
    const before = n.mvs;
    const after = referencedIds.has(n.id) ? Math.min(100, before + 5) : Math.max(MVS_FLOOR, before - 2);
    if (after !== before) adjustments.push({ id: n.id, before, after });
  }
  const byTag = new Map<string, string[]>();
  for (const n of nodes) for (const t of n.tags || []) {
    const k = String(t).toLowerCase();
    byTag.set(k, [...(byTag.get(k) || []), n.id]);
  }
  const themes: ThemeCluster[] = [...byTag.entries()]
    .filter(([, ids]) => ids.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([tag, node_ids]) => ({ tag, node_ids }));
  return { adjustments, themes };
}
