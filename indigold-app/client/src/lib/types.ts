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
}

export interface TimelineEvent {
  id: string;
  date: string;
  type: "connection" | "discovery" | "insight" | "project" | "architecture" | "milestone";
  significance: "critical" | "high" | "medium";
  title: string;
  description: string;
}

export interface InboxItem {
  id: string;
  source: string;
  type: string;
  priority: "high" | "medium" | "low";
  title: string;
  snippet: string;
  timestamp: string;
}

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
