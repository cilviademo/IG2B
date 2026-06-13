// RADIAN pipeline stages 6, 10, 11 — pure logic + parsers (stub + live-fallback).
// Stage 6 Execution Agents (PROPOSAL-ONLY drafts), Stage 10 Strategic Simulation,
// Stage 11 Meta-Radian. Provider-agnostic; no DB, no node-only deps.

import type { Effort } from "./radian-stages2";

// ---- Stage 6: Execution Agents (proposal-only) ----
export type AgentKind = "coding" | "documentation" | "task" | "content" | "music" | "learning";
export const AGENT_KINDS: AgentKind[] = ["coding", "documentation", "task", "content", "music", "learning"];
export interface AgentArtifact { kind: AgentKind; title: string; body: string }

/** Real executors are OFF by default and gated per-kind. In this build RADIAN only
 *  ever DRAFTS — it never pushes code, opens PRs, or calls external write APIs. */
export function executorEnabled(kind: AgentKind, env: Record<string, string | undefined> = process.env): boolean {
  return env[`RADIAN_EXECUTOR_${kind.toUpperCase()}`] === "true";
}

export function deterministicAgentArtifact(kind: AgentKind, subject: { title: string; summary: string }): AgentArtifact {
  const t = subject.title;
  const drafts: Record<AgentKind, { title: string; body: string }> = {
    coding: { title: `Branch plan — ${t}`, body: `# ${t}\n\n## Branch\nfeature/${t.toLowerCase().replace(/\s+/g, "-").slice(0, 32)}\n\n## File-level change spec\n- Identify the module this affects.\n- Add the change behind a flag.\n- Tests for the new path.\n\n## Draft PR description\nImplements ${t}. Scope, rationale, and test notes.` },
    documentation: { title: `Doc draft — ${t}`, body: `# ${t}\n\n${subject.summary}\n\n## Sections\n- Overview\n- Usage\n- Notes` },
    task: { title: `Task breakdown — ${t}`, body: `- [ ] Define done for "${t}"\n- [ ] First concrete step (S)\n- [ ] Follow-up (M)` },
    content: { title: `Content concept — ${t}`, body: `Hook, 3 beats, CTA for "${t}".` },
    music: { title: `Sound-design concept — ${t}`, body: `Sampling/sound-design directions for "${t}": source, processing chain, arrangement idea.` },
    learning: { title: `Study plan — ${t}`, body: `Goal, 3 exercises, and a checkpoint for "${t}".` },
  };
  const d = drafts[kind];
  return { kind, title: d.title, body: d.body };
}

export function parseAgentArtifact(text: string, kind: AgentKind): AgentArtifact | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const body = String(j.body || j.artifact || "");
    if (!body) return null;
    return { kind, title: String(j.title || `${kind} draft`), body };
  } catch {
    // Live models may return raw markdown — accept it as the body.
    return text && text.length > 20 ? { kind, title: `${kind} draft`, body: text.slice(0, 6000) } : null;
  }
}

// ---- Stage 10: Strategic Simulation (estimate, not fact) ----
export type Risk = "LOW" | "MED" | "HIGH";
export interface SimPath { name: string; effort: Effort; risk: Risk; dependencies: string[]; expected_leverage: number; tradeoffs: string }
export interface Simulation { question: string; paths: SimPath[]; assumptions: string[]; confidence: number; recommendation: string }

export function deterministicSimulation(question: string, context: string): Simulation {
  const has = context.length > 10;
  return {
    question,
    paths: [
      { name: "Do it now, minimal scope", effort: "S", risk: "LOW", dependencies: [], expected_leverage: 0.5, tradeoffs: "Fast, but limited upside." },
      { name: "Invest fully", effort: "L", risk: "MED", dependencies: has ? ["existing graph context"] : [], expected_leverage: 0.8, tradeoffs: "High upside, higher cost + opportunity cost." },
      { name: "Defer / watch", effort: "S", risk: "LOW", dependencies: [], expected_leverage: 0.2, tradeoffs: "Preserves focus; risk of missing the window." },
    ],
    assumptions: ["Estimates from current graph state only.", "No external validation performed."],
    confidence: 0.5,
    recommendation: "Start with minimal scope; escalate to full investment only if early signal is strong.",
  };
}

export function parseSimulation(text: string, question: string): Simulation | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const paths = Array.isArray(j.paths) ? j.paths : null;
    if (!paths || !paths.length) return null;
    const ef = ["S", "M", "L"]; const rk = ["LOW", "MED", "HIGH"];
    return {
      question: String(j.question || question),
      paths: (paths as Record<string, unknown>[]).slice(0, 4).map((p) => ({
        name: String(p.name || ""),
        effort: (ef.includes(String(p.effort)) ? String(p.effort) : "M") as Effort,
        risk: (rk.includes(String(p.risk)) ? String(p.risk) : "MED") as Risk,
        dependencies: Array.isArray(p.dependencies) ? p.dependencies.map(String) : [],
        expected_leverage: Math.max(0, Math.min(1, Number(p.expected_leverage ?? 0.5))),
        tradeoffs: String(p.tradeoffs || ""),
      })).filter((p) => p.name),
      assumptions: Array.isArray(j.assumptions) ? j.assumptions.map(String) : [],
      confidence: Math.max(0, Math.min(1, Number(j.confidence ?? 0.5))),
      recommendation: String(j.recommendation || ""),
    };
  } catch {
    return null;
  }
}

// ---- Stage 11: Meta-Radian (System Improvement Memo) ----
export interface MetaRecommendation { area: string; change: string; prompt_key?: string; proposed_version?: string }
export interface MetaMemo { summary: string; recommendations: MetaRecommendation[] }

export interface MetaStats {
  by_purpose: { purpose: string; cost_cents: number; calls: number }[];
  accepted_opportunities: number;
  rejected_opportunities: number;
  reverted_edges: number;
  decision_calibration_gap: number;
}

export function deterministicMetaMemo(s: MetaStats): MetaMemo {
  const recs: MetaRecommendation[] = [];
  const topCost = [...s.by_purpose].sort((a, b) => b.cost_cents - a.cost_cents)[0];
  if (topCost && topCost.cost_cents > 0) {
    recs.push({ area: "budget", change: `"${topCost.purpose}" dominates spend (${(topCost.cost_cents / 100).toFixed(2)} this month). Consider a cheaper tier or tighter prompt.`, prompt_key: topCost.purpose });
  }
  if (s.rejected_opportunities > s.accepted_opportunities) {
    recs.push({ area: "prompt", change: "Opportunity rejections exceed acceptances — tighten the opportunity prompt's relevance bar.", prompt_key: "opportunity", proposed_version: "1.1.0" });
  }
  if (Math.abs(s.decision_calibration_gap) >= 0.1) {
    recs.push({ area: "calibration", change: s.decision_calibration_gap > 0 ? "You're overconfident; discount stated confidence in planning prompts." : "You're underconfident; weight your judgment higher." });
  }
  if (s.reverted_edges > 0) {
    recs.push({ area: "thresholds", change: `${s.reverted_edges} edge(s) reverted — raise the edge-confidence auto-apply threshold.` });
  }
  const summary = recs.length
    ? `Reviewed ${s.by_purpose.reduce((a, b) => a + b.calls, 0)} calls. ${recs.length} improvement(s) proposed. Human approval required before any prompt version bump.`
    : "System healthy — no changes proposed this cycle.";
  return { summary, recommendations: recs };
}

export function parseMetaMemo(text: string): MetaMemo | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.summary !== "string") return null;
    return {
      summary: j.summary,
      recommendations: (Array.isArray(j.recommendations) ? j.recommendations : []).map((r: Record<string, unknown>) => ({
        area: String(r.area || "general"), change: String(r.change || ""),
        prompt_key: r.prompt_key ? String(r.prompt_key) : undefined,
        proposed_version: r.proposed_version ? String(r.proposed_version) : undefined,
      })).filter((r) => r.change),
    };
  } catch {
    return null;
  }
}
