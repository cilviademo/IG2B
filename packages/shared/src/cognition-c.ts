// Cognition Wave C — Memory & Strategy (pure logic + parsers).
// C1 memory tiers · C2 multi-timescale reviews · C3 shadow memory ·
// C6 simulation grounding helpers. Provider-agnostic; no DB/node deps.

import type { GraphNode } from "./types";
import { getVectorStore, type Retrievable } from "./vectorstore";

// ---- C1: Memory tiers ----
// working = active neighborhood · long_term = consolidated/retrievable ·
// core = identity-level (values, durable lessons) — promotion to core requires
// OWNER confirmation; it is NEVER auto-assigned.
export type MemoryTier = "working" | "long_term" | "core";

export function assignMemoryTier(node: { mvs: number; current_tier?: string }, referenced: boolean): MemoryTier {
  if (node.current_tier === "core") return "core"; // sticky; only the owner demotes core
  if (referenced) return "working";
  return "long_term";
}

// ---- C3: Shadow Memory (resurrection) ----
export interface ShadowCandidate {
  id: string;
  title: string;
  reason: string;
  kind: "forgotten_gem" | "context_changed";
}

/** Monthly: surface high-value nodes untouched for a while ("forgotten gems") and
 *  abandoned ideas whose context changed (now related to recent captures via the
 *  VectorStore). This is where embeddings earn their keep; falls back to tag/entity. */
export function findResurrectionCandidates(
  nodes: (GraphNode & { updated_at?: string })[],
  recentContext: { text: string; tags: string[] },
  opts: { staleDays?: number; minMvs?: number; now?: number; limit?: number } = {},
): ShadowCandidate[] {
  const staleDays = opts.staleDays ?? 60;
  const minMvs = opts.minMvs ?? 60;
  const now = opts.now ?? Date.now();
  const stale = (n: { updated_at?: string }) => {
    if (!n.updated_at) return true;
    return (now - new Date(n.updated_at).getTime()) / 86400000 >= staleDays;
  };
  const oldNodes = nodes.filter(stale);

  const out: ShadowCandidate[] = [];
  // 1) forgotten gems: stale + high value.
  for (const n of oldNodes) {
    if (n.mvs >= minMvs) out.push({ id: n.id, title: n.title, reason: `High value (MVS ${n.mvs}), untouched ${staleDays}+ days.`, kind: "forgotten_gem" });
  }
  // 2) context changed: stale nodes newly related to what you're capturing now.
  if (recentContext.text || recentContext.tags.length) {
    const store = getVectorStore();
    const candidates: Retrievable[] = oldNodes.map((n) => ({ subject_type: "node", subject_id: n.id, title: n.title, text: n.summary, tags: n.tags || [] }));
    const matches = store.search(recentContext, candidates, 5);
    for (const m of matches) {
      if (m.score >= 0.25 && !out.some((o) => o.id === m.subject_id)) {
        const n = oldNodes.find((x) => x.id === m.subject_id);
        if (n) out.push({ id: n.id, title: n.title, reason: `Newly relevant to recent activity (${m.why}).`, kind: "context_changed" });
      }
    }
  }
  // de-dupe by id, prefer context_changed, cap.
  const seen = new Set<string>();
  return out
    .sort((a, b) => (a.kind === "context_changed" ? -1 : 0) - (b.kind === "context_changed" ? -1 : 0))
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, opts.limit ?? 5);
}

// ---- C2: Multi-timescale reviews ----
export type ReviewTimescale = "monthly" | "quarterly" | "annual";
export interface Review {
  timescale: ReviewTimescale;
  summary: string;
  themes: string[];
  blind_spots: string[];
  from_the_vault: ShadowCandidate[]; // monthly: resurrection picks
  compounded_on?: string; // the prior review's period this builds on
}

export interface ReviewInputs {
  timescale: ReviewTimescale;
  topNodes: { title: string; mvs: number }[];
  eventCounts: { event_type: string; count: number }[];
  priorSummary?: string; // the previous review at the SAME timescale (compounding)
  calibrationNote?: string;
  constraintDriftNote?: string;
  shadow?: ShadowCandidate[];
}

export function deterministicReview(input: ReviewInputs): Review {
  const top = input.topNodes.slice(0, 5).map((n) => n.title);
  const captureCount = input.eventCounts.find((e) => e.event_type === "capture_created")?.count ?? 0;
  const compounded = input.priorSummary ? `Building on last ${input.timescale}: ${input.priorSummary.slice(0, 120)}` : undefined;
  const summary = [
    `${input.timescale[0].toUpperCase()}${input.timescale.slice(1)} review.`,
    captureCount ? `${captureCount} captures this period.` : "Quiet period.",
    top.length ? `Active threads: ${top.slice(0, 3).join(", ")}.` : "",
    input.calibrationNote || "",
  ].filter(Boolean).join(" ");
  const blind_spots: string[] = [];
  if (input.constraintDriftNote) blind_spots.push(input.constraintDriftNote);
  if (captureCount > 0 && top.length === 0) blind_spots.push("Lots of capture, little consolidation.");
  return {
    timescale: input.timescale,
    summary,
    themes: top,
    blind_spots,
    from_the_vault: input.timescale === "monthly" ? input.shadow ?? [] : [],
    compounded_on: compounded,
  };
}

export function parseReview(text: string, timescale: ReviewTimescale): Review | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.summary !== "string") return null;
    return {
      timescale,
      summary: j.summary,
      themes: Array.isArray(j.themes) ? j.themes.map(String) : [],
      blind_spots: Array.isArray(j.blind_spots) ? j.blind_spots.map(String) : [],
      from_the_vault: [],
      compounded_on: typeof j.compounded_on === "string" ? j.compounded_on : undefined,
    };
  } catch {
    return null;
  }
}

// ---- C6: Simulation grounding (helper text blocks) ----
export function simulationGroundingBlock(input: {
  constraints?: string;
  lifecycleStates?: string;
  calibrationNote?: string;
}): string {
  return [
    input.constraints ? `CONSTRAINTS:\n${input.constraints}` : "",
    input.lifecycleStates ? `PROJECT STATES:\n${input.lifecycleStates}` : "",
    input.calibrationNote ? `YOUR CALIBRATION: ${input.calibrationNote}` : "",
  ].filter(Boolean).join("\n\n");
}
