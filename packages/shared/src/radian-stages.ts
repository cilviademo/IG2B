// RADIAN pipeline stages — pure, deterministic implementations + parsers.
//
// These run as the STUB (no key) path and as the fallback when a live model returns
// unparseable output, so Stages 1–2 always work end-to-end. The worker calls a model
// via governedComplete, then `parseIngest`/`parseContext` the result, falling back to
// the deterministic functions here. Provider-agnostic; no DB, no node-only deps.

import type { GraphNode } from "./types";

// ---- Stage 1: Intelligent Ingest ----
export type CaptureKind = "Idea" | "Task" | "Person" | "Project" | "Reference" | "Learning" | "Asset" | "Opportunity";
export const CAPTURE_KINDS: CaptureKind[] = ["Idea", "Task", "Person", "Project", "Reference", "Learning", "Asset", "Opportunity"];
export type Actionability = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface IngestResult {
  type: CaptureKind;
  summary: string;
  entities: string[];
  mvs: { score: number; why: string };
  actionability: Actionability;
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "your", "about", "have", "will", "code", "http", "https", "www", "com"]);

function keywords(text: string, n = 8): string[] {
  const counts = new Map<string, number>();
  for (const w of (text || "").toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) ?? []) {
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

/** Deterministic Stage 1 — heuristic but specific. Used as stub + live-fallback. */
export function deterministicIngest(cap: { title?: string | null; note?: string | null; url?: string | null; source?: string | null }): IngestResult {
  const text = `${cap.title || ""} ${cap.note || ""}`.trim();
  const url = (cap.url || "").toLowerCase();
  const lower = text.toLowerCase();
  const entities = keywords(`${text} ${url}`);

  let type: CaptureKind = "Reference";
  let actionability: Actionability = "LOW";
  if (/github\.com|gitlab\.com|\.git\b/.test(url)) { type = "Reference"; actionability = "HIGH"; }
  else if (/youtube\.com|youtu\.be|instagram\.com|tiktok\.com/.test(url)) { type = "Reference"; actionability = "MEDIUM"; }
  if (/\b(todo|task|fix|build|ship|implement|finish|deadline|due)\b/.test(lower)) { type = "Task"; actionability = "HIGH"; }
  else if (/\b(idea|concept|what if|maybe|could)\b/.test(lower)) { type = "Idea"; actionability = "MEDIUM"; }
  else if (/\b(learn|study|course|tutorial|how to)\b/.test(lower)) { type = "Learning"; actionability = "MEDIUM"; }
  else if (/\b(opportunity|launch|market|revenue|monetize)\b/.test(lower)) { type = "Opportunity"; actionability = "HIGH"; }
  if ((cap.source || "").includes("upload") || /\.(pdf|png|jpe?g|wav|mp3|m4a|zip)$/.test(url)) type = "Asset";

  const summary = (text.split(/(?<=[.!?])\s/)[0] || text || cap.title || "Captured item").slice(0, 220);
  const score = Math.min(95, 40 + entities.length * 5 + (actionability === "HIGH" ? 20 : actionability === "MEDIUM" ? 10 : 0));
  return { type, summary, entities, mvs: { score, why: `${entities.length} entities; actionability ${actionability}` }, actionability };
}

function isKind(s: unknown): s is CaptureKind { return typeof s === "string" && (CAPTURE_KINDS as string[]).includes(s); }

/** Parse a model's JSON ingest output; returns null if it doesn't match the schema. */
export function parseIngest(text: string): IngestResult | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (!isKind(j.type)) return null;
    const mvs = j.mvs as { score?: number; why?: string } | undefined;
    const act = String(j.actionability || "LOW").toUpperCase() as Actionability;
    return {
      type: j.type,
      summary: String(j.summary || "").slice(0, 400),
      entities: Array.isArray(j.entities) ? j.entities.map(String).slice(0, 16) : [],
      mvs: { score: Math.max(0, Math.min(100, Number(mvs?.score ?? 50))), why: String(mvs?.why || "") },
      actionability: (["NONE", "LOW", "MEDIUM", "HIGH"] as string[]).includes(act) ? act : "LOW",
    };
  } catch {
    return null;
  }
}

// ---- Stage 2: Contextualization ----
export type EdgeKind = "similar" | "contradicts" | "depends_on" | "extends";
export interface ContextEdge { target_id: string; relationship: EdgeKind; confidence: number; why: string }
export interface ProjectRelevance { registry_id: string; relevance: number; why: string }
export interface ContextResult { edges: ContextEdge[]; project_relevance: ProjectRelevance[] }

export interface RegistryProject { id: string; name: string; tags: string[]; objectives: string }

/** Deterministic Stage 2 — tag/entity overlap for edges + project relevance. */
export function deterministicContextualize(
  subject: { id: string; tags: string[]; title: string; summary: string },
  neighbors: GraphNode[],
  projects: RegistryProject[],
): ContextResult {
  const subjTags = new Set((subject.tags || []).map((t) => t.toLowerCase()));
  const edges: ContextEdge[] = [];
  for (const n of neighbors) {
    if (n.id === subject.id) continue;
    const overlap = (n.tags || []).filter((t) => subjTags.has(String(t).toLowerCase()));
    if (overlap.length) {
      edges.push({
        target_id: n.id,
        relationship: "similar",
        confidence: Math.min(0.9, 0.4 + overlap.length * 0.15),
        why: `shared: ${overlap.slice(0, 3).join(", ")}`,
      });
    }
    if (edges.length >= 6) break;
  }

  const hay = `${subject.title} ${subject.summary} ${[...subjTags].join(" ")}`.toLowerCase();
  const project_relevance: ProjectRelevance[] = [];
  for (const p of projects) {
    const terms = [...p.tags.map((t) => t.toLowerCase()), ...keywords(p.objectives, 4)];
    const hits = terms.filter((t) => hay.includes(t));
    if (hits.length) {
      project_relevance.push({
        registry_id: p.id,
        relevance: Math.min(1, hits.length / Math.max(3, terms.length) + 0.2),
        why: `matches ${hits.slice(0, 3).join(", ")}`,
      });
    }
  }
  project_relevance.sort((a, b) => b.relevance - a.relevance);
  return { edges, project_relevance: project_relevance.slice(0, 5) };
}

export function parseContext(text: string, validTargetIds: Set<string>, validProjectIds: Set<string>): ContextResult | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const kinds: string[] = ["similar", "contradicts", "depends_on", "extends"];
    const edges = (Array.isArray(j.edges) ? j.edges : [])
      .map((e: Record<string, unknown>) => ({
        target_id: String(e.target_id || ""),
        relationship: (kinds.includes(String(e.relationship)) ? String(e.relationship) : "similar") as EdgeKind,
        confidence: Math.max(0, Math.min(1, Number(e.confidence ?? 0.5))),
        why: String(e.why || ""),
      }))
      .filter((e: ContextEdge) => validTargetIds.has(e.target_id));
    const project_relevance = (Array.isArray(j.project_relevance) ? j.project_relevance : [])
      .map((p: Record<string, unknown>) => ({
        registry_id: String(p.registry_id || ""),
        relevance: Math.max(0, Math.min(1, Number(p.relevance ?? 0))),
        why: String(p.why || ""),
      }))
      .filter((p: ProjectRelevance) => validProjectIds.has(p.registry_id));
    return { edges, project_relevance };
  } catch {
    return null;
  }
}

// Map a Stage-1 CaptureKind to the existing graph node `type` enum.
export function kindToNodeType(kind: CaptureKind): GraphNode["type"] {
  switch (kind) {
    case "Person": return "person";
    case "Project": case "Opportunity": return "project";
    case "Idea": case "Learning": return "concept";
    default: return "resource";
  }
}
