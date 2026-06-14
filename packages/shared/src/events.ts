// Cognition Expansion Wave A — Event Store vocabulary (pure types).
// Events are append-only: never mutated or deleted. The current-state tables stay
// the fast read path; events are the audit history + replay substrate. Every
// pipeline write should emit an event in the same logical operation.

export type EventActor =
  | "user" | "radian" | "encompass" | "system"
  | `agent:${string}`; // e.g. "agent:Atlas", "agent:Sentinel"

// Extensible vocabulary. Add new members here as new write paths are instrumented.
export type EventType =
  | "capture_created"
  | "upload_completed"
  | "classified"
  | "node_created"
  | "edge_created"
  | "edge_reverted"
  | "brief_generated"
  | "research_run"
  | "suggestion_accepted"
  | "suggestion_rejected"
  | "decision_recorded"
  | "outcome_recorded"
  | "hypothesis_updated"
  | "simulation_completed"
  | "review_generated"
  | "consolidation_run"
  | "opportunity_created"
  | "system_improvement_generated"
  | "constraint_updated"
  | "state_transition"
  | "archived"
  | "deleted";

export const EVENT_TYPES: EventType[] = [
  "capture_created", "upload_completed", "classified", "node_created", "edge_created",
  "edge_reverted", "brief_generated", "research_run", "suggestion_accepted",
  "suggestion_rejected", "decision_recorded", "outcome_recorded", "hypothesis_updated",
  "simulation_completed", "review_generated", "consolidation_run", "opportunity_created",
  "system_improvement_generated", "constraint_updated", "state_transition",
  "archived", "deleted",
];

export interface IndigoldEvent {
  id: string;
  ts: string;
  user_id?: string | null;
  actor: EventActor;
  event_type: EventType;
  subject_type: string; // "capture" | "node" | "edge" | "brief" | ...
  subject_id?: string | null;
  payload: Record<string, unknown>;
  correlation_id?: string | null; // ties a full lifecycle together (usually the capture id)
}

export function isEventType(s: string): s is EventType {
  return (EVENT_TYPES as string[]).includes(s);
}
