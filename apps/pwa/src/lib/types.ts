// Indigold v0.1 synthetic data contracts (mirrors client/public/data/*.json).

export type TruthLayer = "A" | "B" | "C" | "D" | "E" | "F";

export interface GraphNode {
  id: string;
  type: "project" | "person" | "concept" | "resource";
  title: string;
  summary: string;
  truth_layer: TruthLayer;
  truth_label: string;
  mvs: number;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface GraphEdge {
  source_id: string;
  target_id: string;
  relationship: string;
  valid_from: string;
  label: string;
  weight?: number;
}

export interface TimelineEvent {
  id: string;
  date: string;
  type: "connection" | "discovery" | "insight" | "project" | "architecture" | "milestone";
  significance: "critical" | "high" | "medium";
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Capture model — iPhone-first capture workflow.
//   iPhone Share Sheet -> Apple Shortcut -> Inbox folder -> PWA Inbox/Import.
// Captures are always raw (Truth Layer A) and start unprocessed. AI processing
// (OCR, transcription, summarization, tagging) is a LATER phase — not v0.1.
// ---------------------------------------------------------------------------
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

export type Sensitivity = "public" | "internal" | "private" | "secret";
export type ProcessingStatus = "unprocessed" | "queued" | "processing" | "processed";
export type CaptureStatus = "inbox" | "triaged" | "archived";

export interface Capture {
  id: string;
  type: CaptureType;
  source: string;
  captured_at: string;
  truth_layer: TruthLayer; // raw captures are always "A"
  status: CaptureStatus;
  sensitivity: Sensitivity;
  processing_status: ProcessingStatus;
  title: string;
  note: string;
  url?: string;
  screenshot_ref?: string;
}

export const CAPTURE_TYPE_LABEL: Record<CaptureType, string> = {
  apple_note: "Apple Note",
  web_link: "Web Link",
  instagram_reel: "Instagram Reel",
  threads_post: "Threads Post",
  screenshot: "Screenshot",
  voice_memo: "Voice Memo",
  document: "Document",
  llm_conversation: "LLM Conversation",
  manual_text: "Manual Text",
};

export const SENSITIVITY_COLOR: Record<Sensitivity, string> = {
  public: "oklch(0.72 0.15 195)", // teal
  internal: "oklch(0.6 0.2 264)", // indigo
  private: "oklch(0.78 0.14 85)", // gold
  secret: "oklch(0.6 0.22 25)", // red
};

export const PROCESSING_META: Record<ProcessingStatus, { label: string; color: string }> = {
  unprocessed: { label: "Unprocessed", color: "oklch(0.5 0.02 280)" },
  queued: { label: "Queued", color: "oklch(0.75 0.16 60)" },
  processing: { label: "Processing", color: "oklch(0.6 0.2 264)" },
  processed: { label: "Processed", color: "oklch(0.72 0.15 195)" },
};

export const SENSITIVITY_CYCLE: Sensitivity[] = ["public", "internal", "private", "secret"];

export interface DashboardData {
  brief: string;
  urgent_actions: { text: string; priority: "high" | "medium" }[];
  stats: {
    nodes: number;
    projects: number;
    inbox: number;
    avg_mvs: number;
    review: number;
    edges: number;
  };
  insights: string[];
}

export interface ContextPackData {
  title: string;
  purpose: string;
  token_budget: { total: number; used: number };
  source_nodes: string[];
  updated_at: string;
  sections: {
    heading: string;
    content: string;
    truth_layer: TruthLayer;
    provenance: string;
  }[];
}

export interface WeeklyBriefData {
  period: string;
  summary: string;
  forecasts: {
    type: "Opportunity" | "Risk";
    title: string;
    detail: string;
    confidence: number;
  }[];
  knowledge_evolution: {
    new_nodes: number;
    new_edges: number;
    strongest_cluster: string;
    emerging_bridge: string;
    decay_alerts: string[];
  };
  boardroom_synthesis: string;
  actions: { text: string; priority: "high" | "medium" | "low" }[];
}

// Truth Layer presentation map (epistemological hierarchy).
export const TRUTH_LAYER_COLORS: Record<TruthLayer, string> = {
  A: "#EF4444",
  B: "#F59E0B",
  C: "#4F46E5",
  D: "#22D3EE",
  E: "#D4A843",
  F: "#A78BFA",
};
