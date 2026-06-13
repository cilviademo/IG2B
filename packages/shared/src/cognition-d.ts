// Cognition Wave D — Governance, Agents, Resilience (pure logic + constants).
// D1 agent society · D2 human override (constitutional) · D3 wisdom layer ·
// D4 export bundle shape. Provider-agnostic; no DB/node deps.

// ---- D1: Agent Society (one owner per responsibility; no overlap) ----
// Namespaced roles all run in the in-process worker. Every model call + event
// carries its agent name as `actor` (e.g. "agent:Atlas"). Clean seam for real
// service separation later (render.full.yaml).
export const AGENT_ROLES: Record<string, string> = {
  Radian: "synthesis / strategy",
  Encompass: "context assembly",
  Hermes: "research / external sources",
  Atlas: "graph maintenance / linking",
  Chronos: "scheduling / timescale reviews",
  Oracle: "simulation / forecasting",
  Forge: "proposal-only execution drafts",
  Sentinel: "budget, privacy boundary, constraint enforcement, anomaly flags",
  Archivist: "consolidation / memory tiers / shadow memory",
  Auditor: "meta memo / calibration / event-store analytics",
};
export type AgentName = keyof typeof AGENT_ROLES;
export const agentActor = (name: AgentName): `agent:${string}` => `agent:${name}`;

// ---- D2: Human Override (constitutional) ----
// AI advises; the human decides. These domains are NEVER delegated — agents surface
// options and defer; the values/principles content of core memory is owner-authored
// only (AI may quote it, never write it).
export const NEVER_DELEGATED = ["purpose", "ethics", "faith", "values", "relationships", "meaning"] as const;
export type SacredDomain = (typeof NEVER_DELEGATED)[number];
export function isDelegable(domain: string): boolean {
  return !(NEVER_DELEGATED as readonly string[]).includes(domain.toLowerCase());
}
// Hard boundaries the AI may never cross autonomously.
export const NEVER_AUTO = [
  "apply a decision",
  "promote a lifecycle past research",
  "write to core memory",
  "adopt an opportunity as a project",
  "push code / open a PR / call a write-API",
] as const;

/** Injected into every planning-class prompt to encode the boundary. */
export function constitutionBlock(): string {
  return [
    "CONSTITUTION (non-negotiable):",
    "- You ADVISE; the human DECIDES. Surface options; never auto-apply.",
    `- Never autonomously: ${NEVER_AUTO.join("; ")}.`,
    `- In these domains, surface options and DEFER to the owner: ${NEVER_DELEGATED.join(", ")}.`,
    "- You may quote the owner's principles; you may never author or edit them.",
  ].join("\n");
}

// ---- D3: Wisdom Layer (alignment-checking, no autonomy) ----
export interface ActivityShare { area: string; share: number } // share 0..1 of capture volume
export interface WisdomCheck {
  aligned: boolean;
  drift: string[]; // explicit, cited drift statements
  note: string;
}
/** Reconcile where attention is actually going against the owner's stated priorities.
 *  Flags drift like "80% of capture is tooling; your stated priority is shipping BTZ". */
export function whatMatters(activity: ActivityShare[], statedPriorities: string[]): WisdomCheck {
  const drift: string[] = [];
  const top = [...activity].sort((a, b) => b.share - a.share)[0];
  const priorities = statedPriorities.map((p) => p.toLowerCase());
  if (top && top.share >= 0.5) {
    const matchesPriority = priorities.some((p) => p.includes(top.area.toLowerCase()) || top.area.toLowerCase().includes(p.split(/\s+/)[0] || ""));
    if (!matchesPriority && priorities.length) {
      drift.push(`${Math.round(top.share * 100)}% of activity is "${top.area}"; your stated priority is "${statedPriorities[0]}".`);
    }
  }
  for (const p of statedPriorities) {
    const covered = activity.some((a) => p.toLowerCase().includes(a.area.toLowerCase()) || a.area.toLowerCase().includes((p.toLowerCase().split(/\s+/)[0]) || ""));
    if (!covered) drift.push(`Stated priority "${p}" has little or no recent activity.`);
  }
  return {
    aligned: drift.length === 0,
    drift,
    note: drift.length ? "Activity is drifting from stated priorities." : "Activity is aligned with stated priorities.",
  };
}

// ---- D4: Export bundle (no lock-in) ----
// The vault must be reconstructable from one JSON bundle + the R2 objects.
export const EXPORT_BUNDLE_VERSION = "1.0.0";
export interface ExportBundle {
  app: "Indigold";
  bundle_version: string;
  exported_at: string;
  user_id: string;
  counts: Record<string, number>;
  data: {
    projects: unknown[];
    captures: unknown[];
    nodes: unknown[];
    edges: unknown[];
    events: unknown[];
    briefs: unknown[];
    decisions: unknown[];
    opportunities: unknown[];
    constraints: unknown;
    assets: unknown[]; // metadata only; bytes live in R2
  };
}
