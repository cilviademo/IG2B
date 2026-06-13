// Cognition Wave B — Knowledge Layers (pure logic + vocabularies).
// B1 epistemic truth types · B2 causal edge vocabulary · B3 lifecycle states ·
// B4 constraint engine · B6 attention layer. Provider-agnostic; no DB/node deps.

// ---- B1: Epistemic truth types ----
// What KIND of claim a node/statement is. Prompts must declare which they produce
// and may NEVER emit an `observation` the user didn't capture.
export type EpistemicType =
  | "observation" | "source" | "inference" | "belief" | "hypothesis" | "decision" | "outcome" | "lesson";
export const EPISTEMIC_TYPES: EpistemicType[] = ["observation", "source", "inference", "belief", "hypothesis", "decision", "outcome", "lesson"];
// Single mono glyph for the UI badge (extends the C/D provenance badges).
export const EPISTEMIC_GLYPH: Record<EpistemicType, string> = {
  observation: "O", source: "S", inference: "I", belief: "B", hypothesis: "H", decision: "D", outcome: "T", lesson: "L",
};
export function isEpistemicType(s: string): s is EpistemicType {
  return (EPISTEMIC_TYPES as string[]).includes(s);
}

// ---- B2: Causal edge vocabulary (extends Stage-2's typed edges) ----
export type CausalEdgeType =
  | "supports" | "contradicts" | "extends" | "depends_on"
  | "causes" | "blocks" | "accelerates" | "evidence_for" | "evidence_against";
export const CAUSAL_EDGE_TYPES: CausalEdgeType[] = ["supports", "contradicts", "extends", "depends_on", "causes", "blocks", "accelerates", "evidence_for", "evidence_against"];
// Directional cue in Atlas (causal edges get an arrow; evidence feeds the Hypothesis Engine).
export const DIRECTIONAL_EDGES = new Set<CausalEdgeType>(["causes", "blocks", "accelerates", "depends_on"]);
export const EVIDENCE_EDGES = new Set<CausalEdgeType>(["evidence_for", "evidence_against"]);
// Old free-text relationships map cleanly forward.
export function mapLegacyEdge(rel: string): CausalEdgeType | string {
  const m: Record<string, CausalEdgeType> = { relates_to: "supports", similar: "supports", extends: "extends", depends_on: "depends_on", contradicts: "contradicts" };
  return m[rel] || rel;
}

// ---- B3: Lifecycle state machine ----
export type LifecycleKind = "project" | "skill" | "person" | "goal" | "opportunity" | "habit";
export const LIFECYCLE_STATES = ["idea", "research", "planning", "building", "testing", "launching", "maintaining", "archived"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];
// Per-kind allowed subsets (config-driven; defaults below).
export const LIFECYCLE_BY_KIND: Record<LifecycleKind, LifecycleState[]> = {
  project: [...LIFECYCLE_STATES],
  skill: ["idea", "research", "building", "maintaining", "archived"],
  person: ["idea", "maintaining", "archived"],
  goal: ["idea", "planning", "building", "maintaining", "archived"],
  opportunity: ["idea", "research", "planning", "archived"],
  habit: ["building", "maintaining", "archived"],
};
// Transitions past idea/research require owner confirmation (AI may only suggest).
const AUTO_OK = new Set<LifecycleState>(["idea", "research"]);
export function transitionNeedsConfirmation(to: LifecycleState): boolean {
  return !AUTO_OK.has(to);
}
export function isValidTransition(kind: LifecycleKind, from: LifecycleState, to: LifecycleState): boolean {
  const allowed = LIFECYCLE_BY_KIND[kind];
  if (!allowed.includes(to)) return false;
  const fi = allowed.indexOf(from);
  const ti = allowed.indexOf(to);
  // forward by any number of steps, or archive from anywhere; no backward except to archived
  return to === "archived" || ti > fi;
}

// ---- B4: Constraint Engine ----
export interface ConstraintProfile {
  weekly_hours: number; // time available per week
  money_budget_cents?: number;
  energy_notes?: string;
  max_concurrent_builds?: number;
  risk_tolerance?: "low" | "medium" | "high";
  commitments?: string[]; // standing: duty schedule, family, deadlines
  updated_at?: string;
}
export const DEFAULT_CONSTRAINTS: ConstraintProfile = {
  weekly_hours: 6, max_concurrent_builds: 2, risk_tolerance: "medium", commitments: [],
};
// Effort → rough weekly-hours estimate, so a plan's cost can be reconciled.
const EFFORT_HOURS: Record<string, number> = { S: 2, M: 6, L: 12 };
export interface PlanItem { action: string; effort?: string; project?: string }
export interface ConstraintCheck { ok: boolean; required_hours: number; available_hours: number; violations: string[] }

/** Reconcile a set of proposed actions against the constraint profile. This is what
 *  keeps advice REAL instead of aspirational — violations are flagged explicitly. */
export function reconcileAgainstConstraints(items: PlanItem[], profile: ConstraintProfile): ConstraintCheck {
  const required = items.reduce((s, i) => s + (EFFORT_HOURS[(i.effort || "M").toUpperCase()] ?? 6), 0);
  const available = profile.weekly_hours;
  const violations: string[] = [];
  if (required > available) violations.push(`This plan needs ~${required}h/wk; your profile allows ${available}h.`);
  const distinctBuilds = new Set(items.map((i) => i.project).filter(Boolean)).size;
  if (profile.max_concurrent_builds && distinctBuilds > profile.max_concurrent_builds) {
    violations.push(`Spans ${distinctBuilds} projects; your focus limit is ${profile.max_concurrent_builds} concurrent.`);
  }
  return { ok: violations.length === 0, required_hours: required, available_hours: available, violations };
}

/** Render the profile for injection into planning prompts. */
export function constraintPromptBlock(profile: ConstraintProfile): string {
  return [
    `Weekly time available: ${profile.weekly_hours}h`,
    profile.max_concurrent_builds ? `Max concurrent builds: ${profile.max_concurrent_builds}` : "",
    profile.risk_tolerance ? `Risk tolerance: ${profile.risk_tolerance}` : "",
    profile.commitments?.length ? `Standing commitments: ${profile.commitments.join("; ")}` : "",
    profile.energy_notes ? `Energy: ${profile.energy_notes}` : "",
    "Reconcile every recommendation against these; flag any that exceed them.",
  ].filter(Boolean).join("\n");
}

// ---- B6: Attention Layer (MVS != attention) ----
export interface AttentionInputs {
  importance: number; // 0..100 (long-term value, ~MVS)
  urgency: number; // 0..100 (time pressure)
  recencyDays: number; // days since last touch
  signal: number; // 0..1 signal-to-noise for this source/type
}
/** Composite attention score (0..100). The loudest input must not always win. */
export function attentionScore(i: AttentionInputs): number {
  const recency = Math.max(0, 100 - i.recencyDays * 3); // fades over ~33 days
  const raw = 0.4 * i.importance + 0.3 * i.urgency + 0.15 * recency + 0.15 * (i.signal * 100);
  return Math.round(Math.max(0, Math.min(100, raw)));
}
/** Urgency from a due/review date (closer = higher). */
export function urgencyFromDate(dateIso?: string | null, now = Date.now()): number {
  if (!dateIso) return 30;
  const days = (new Date(dateIso).getTime() - now) / 86400000;
  if (days <= 0) return 100;
  return Math.max(0, Math.round(100 - days * 8)); // ~12 days out → 0
}

/** Signal-to-noise per source, LEARNED from accept/reject events (B6 monthly recalc).
 *  accepted raises signal, rejected lowers it; defaults to 0.6 with no history. */
export function computeSignalToNoise(events: { event_type: string; payload?: { source?: string } }[]): Record<string, number> {
  const acc: Record<string, { a: number; r: number }> = {};
  for (const e of events) {
    const src = e.payload?.source || "unknown";
    if (e.event_type === "suggestion_accepted") (acc[src] ??= { a: 0, r: 0 }).a++;
    else if (e.event_type === "suggestion_rejected") (acc[src] ??= { a: 0, r: 0 }).r++;
  }
  const out: Record<string, number> = {};
  for (const [src, { a, r }] of Object.entries(acc)) {
    const total = a + r;
    out[src] = total ? Math.max(0.1, Math.min(1, (a + 1) / (total + 2))) : 0.6; // Laplace-smoothed
  }
  return out;
}
