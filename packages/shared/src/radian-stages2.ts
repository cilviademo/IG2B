// RADIAN pipeline stages 3–5 — pure logic + parsers (stub + live-fallback).
// Stage 3 Assistance (suggested actions / playbooks / NEXT ACTIONS), Stage 4
// Research synthesis (findings -> captures), Stage 5 brief shaping. Provider-agnostic.

import type { GraphNode } from "./types";
import type { RegistryProject } from "./radian-stages";

// ---- Stage 3: Assistance Engine ----
export type Effort = "S" | "M" | "L";
export type Leverage = "LOW" | "MED" | "HIGH";
export interface NextAction { action: string; project: string; effort: Effort; leverage: Leverage; confidence: number }
export interface Suggestion { text: string; project: string; confidence: number }
export interface AssistResult { playbook: string[]; suggestions: Suggestion[]; next_actions: NextAction[] }

/** Parse a github(.com) repo URL -> {owner, repo}. */
export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const m = (url || "").match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

function topProject(node: { tags: string[]; title: string; summary: string }, projects: RegistryProject[]): RegistryProject | null {
  const hay = `${node.title} ${node.summary} ${(node.tags || []).join(" ")}`.toLowerCase();
  let best: RegistryProject | null = null;
  let bestHits = 0;
  for (const p of projects) {
    const hits = p.tags.filter((t) => hay.includes(t.toLowerCase())).length;
    if (hits > bestHits) { bestHits = hits; best = p; }
  }
  return best || projects[0] || null;
}

/** Deterministic Stage 3 — specific, project-anchored. Stub + live-fallback.
 *  For a GitHub repo it produces the clone -> study -> adapt -> prototype -> A/B
 *  playbook from the directive; otherwise insight/experiment/task suggestions. */
export function deterministicAssist(
  node: { title: string; summary: string; tags: string[]; url?: string | null; kind?: string },
  projects: RegistryProject[],
  repo?: { owner: string; repo: string } | null,
): AssistResult {
  const proj = topProject(node, projects);
  const pname = proj?.name || "your active work";
  const pid = proj?.id || "";
  if (repo) {
    return {
      playbook: [
        `Clone ${repo.owner}/${repo.repo} and skim its README + top-level structure.`,
        `Study the core source (e.g. /src or /dsp) for the technique relevant to ${pname}.`,
        `Adapt the key algorithm into a throwaway prototype branch in ${pname}.`,
        `A/B the prototype against your current ${pname} implementation; keep notes.`,
        `Promote or archive based on the comparison — record the decision.`,
      ],
      suggestions: [
        { text: `Evaluate ${repo.repo} against ${pname}'s current approach`, project: pid, confidence: 0.7 },
      ],
      next_actions: [
        { action: `Clone & build ${repo.owner}/${repo.repo}`, project: pid, effort: "S", leverage: "MED", confidence: 0.8 },
        { action: `Prototype its core idea inside ${pname}`, project: pid, effort: "M", leverage: "HIGH", confidence: 0.6 },
      ],
    };
  }
  return {
    playbook: [],
    suggestions: [
      { text: `Connect "${node.title}" to ${pname}`, project: pid, confidence: 0.6 },
    ],
    next_actions: [
      { action: `Decide the single next step for "${node.title}" within ${pname}`, project: pid, effort: "S", leverage: "MED", confidence: 0.6 },
    ],
  };
}

const EFFORTS = ["S", "M", "L"]; const LEVERAGES = ["LOW", "MED", "HIGH"];
export function parseAssist(text: string): AssistResult | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const next_actions = (Array.isArray(j.next_actions) ? j.next_actions : []).map((a: Record<string, unknown>) => ({
      action: String(a.action || ""),
      project: String(a.project || ""),
      effort: (EFFORTS.includes(String(a.effort)) ? String(a.effort) : "M") as Effort,
      leverage: (LEVERAGES.includes(String(a.leverage)) ? String(a.leverage) : "MED") as Leverage,
      confidence: Math.max(0, Math.min(1, Number(a.confidence ?? 0.5))),
    })).filter((a: NextAction) => a.action);
    if (!next_actions.length) return null;
    return {
      playbook: Array.isArray(j.playbook) ? j.playbook.map(String) : [],
      suggestions: (Array.isArray(j.suggestions) ? j.suggestions : []).map((s: Record<string, unknown>) => ({
        text: String(s.text || ""), project: String(s.project || ""), confidence: Math.max(0, Math.min(1, Number(s.confidence ?? 0.5))),
      })).filter((s: Suggestion) => s.text),
      next_actions,
    };
  } catch {
    return null;
  }
}

// ---- Stage 4: Research synthesis ----
export interface ResearchFinding { title: string; summary: string; url?: string }

/** Deterministic Stage 4 fallback — turns gathered tool data into finding stubs. */
export function deterministicResearch(subject: { title: string; url?: string | null }, gathered: string): ResearchFinding[] {
  const base = subject.title.replace(/\s+/g, " ").trim();
  return [
    { title: `Source trace: ${base}`, summary: gathered ? gathered.slice(0, 300) : `Traced ${base}; no external data fetched (stub mode).`, url: subject.url || undefined },
  ];
}

export function parseResearch(text: string): ResearchFinding[] | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const arr = Array.isArray(j.findings) ? j.findings : Array.isArray(j) ? (j as unknown[]) : null;
    if (!arr) return null;
    return (arr as Record<string, unknown>[]).map((f) => ({ title: String(f.title || ""), summary: String(f.summary || ""), url: f.url ? String(f.url) : undefined })).filter((f) => f.title);
  } catch {
    return null;
  }
}

// ---- Stage 5: brief shaping (registry-aware) ----
export interface DailyBrief { summary: string; urgent_actions: { text: string; project: string; priority: string }[] }
export function parseDailyBrief(text: string): DailyBrief | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.summary !== "string") return null;
    return {
      summary: j.summary,
      urgent_actions: (Array.isArray(j.urgent_actions) ? j.urgent_actions : []).map((a: Record<string, unknown>) => ({
        text: String(a.text || ""), project: String(a.project || ""), priority: String(a.priority || "medium"),
      })).filter((a) => a.text),
    };
  } catch {
    return null;
  }
}

/** Deterministic daily brief from recent nodes — stub + fallback, registry-aware. */
export function deterministicDailyBrief(recent: GraphNode[], projects: RegistryProject[]): DailyBrief {
  const high = [...recent].sort((a, b) => b.mvs - a.mvs).slice(0, 3);
  const summary = recent.length
    ? `${recent.length} item(s) enriched recently; ${high.length} high-value. Top: ${high.map((n) => n.title).slice(0, 2).join(", ") || "—"}.`
    : "No new activity. Capture something to start compounding.";
  return {
    summary,
    urgent_actions: high.map((n) => ({ text: `Advance "${n.title}"`, project: projects[0]?.id || "", priority: n.mvs >= 80 ? "high" : "medium" })),
  };
}
