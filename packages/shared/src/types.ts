// Browser-safe domain types shared across the PWA, API, workers, and services.
// NOTE: keep this file free of node-only imports — the PWA imports it directly.

export type TruthLayer = "A" | "B" | "C" | "D" | "E" | "F";
export type Sensitivity = "public" | "internal" | "private" | "secret";
export type ProcessingStatus = "unprocessed" | "queued" | "processing" | "processed";
export type CaptureStatus = "inbox" | "triaged" | "archived";

export type CaptureType =
  | "apple_note"
  | "web_link"
  | "instagram_reel"
  | "threads_post"
  | "screenshot"
  | "voice_memo"
  | "document"
  | "llm_conversation"
  | "manual_text";

export interface Capture {
  id: string;
  user_id: string;
  type: CaptureType;
  source: string;
  captured_at: string;
  truth_layer: TruthLayer;
  status: CaptureStatus;
  sensitivity: Sensitivity;
  processing_status: ProcessingStatus;
  title: string;
  note: string;
  url?: string | null;
  screenshot_ref?: string | null;
  created_at?: string;
}

export interface GraphNode {
  id: string;
  user_id: string;
  type: "project" | "person" | "concept" | "resource";
  title: string;
  summary: string;
  truth_layer: TruthLayer;
  truth_label: string;
  mvs: number;
  tags: string[];
  created_at?: string;
  updated_at?: string;
}

export interface GraphEdge {
  id: string;
  user_id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  weight?: number;
  valid_from: string;
  valid_until?: string | null;
  label: string;
}

export interface TimelineEvent {
  id: string;
  user_id: string;
  date: string;
  type: "connection" | "discovery" | "insight" | "project" | "architecture" | "milestone";
  significance: "critical" | "high" | "medium";
  title: string;
  description: string;
  node_id?: string | null;
}

export interface ContextPack {
  id: string;
  user_id: string;
  title: string;
  purpose: string;
  token_budget: { total: number; used: number };
  source_nodes: string[];
  sections: { heading: string; content: string; truth_layer: TruthLayer; provenance: string }[];
  created_at?: string;
}

export interface Brief {
  id: string;
  user_id: string;
  kind: "daily" | "weekly" | "forecast";
  period: string;
  payload: Record<string, unknown>;
  created_at?: string;
}

export type JobType =
  | "ingest_capture"
  | "contextualize"
  | "summarize"
  | "tag"
  | "graph_update"
  | "context_pack"
  | "research"
  | "daily_brief"
  | "weekly_review"
  | "monitor_scan";

export interface Job<T = Record<string, unknown>> {
  id: string;
  type: JobType;
  user_id: string;
  payload: T;
  enqueued_at: string;
}

export interface User {
  id: string;
  email: string;
  created_at?: string;
}
