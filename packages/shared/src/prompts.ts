// RADIAN prompt registry — versioned, provenance-bearing prompts.
//
// Every AI output stores the prompt VERSION used (Iron principle #5: provenance
// everywhere). Meta-Radian (Wave 4) proposes diffs; a human approves and bumps
// the version here (or via the prompt_overrides table for runtime tuning without
// redeploy). Prompts are seeded as code constants; the DB table can override.

import type { ModelTier } from "./model";

export interface PromptDef {
  key: string;
  version: string; // bump on any wording change; stored in provenance
  tier: ModelTier; // which tier this prompt is written for
  build: (vars: Record<string, string>) => { system: string; prompt: string };
}

const v = (s: string) => (s || "").trim();

// Wave 1 will fill in the real bodies; Wave 0 seeds the registry + versions so the
// seam, provenance, and Meta-Radian bump mechanism exist and are testable.
export const PROMPTS: Record<string, PromptDef> = {
  ingest_classify: {
    key: "ingest_classify",
    version: "1.0.0",
    tier: "cheap",
    build: (x) => ({
      system: v(`You are RADIAN's ingest analyst. Classify a captured item for a personal intelligence vault.
Return JSON: {type, summary, entities, mvs:{score,why}, actionability}.
type ∈ Idea|Task|Person|Project|Reference|Learning|Asset|Opportunity.
actionability ∈ NONE|LOW|MEDIUM|HIGH. Be concise and specific.`),
      prompt: v(`TITLE: ${x.title || ""}\nSOURCE: ${x.source || ""}\nURL: ${x.url || ""}\nCONTENT:\n${x.content || ""}`),
    }),
  },
  contextualize: {
    key: "contextualize",
    version: "1.0.0",
    tier: "cheap",
    build: (x) => ({
      system: v(`You are RADIAN's contextualizer. Given a new item and candidate neighbors + the owner's project registry,
return JSON: {edges:[{target_id,relationship,confidence,why}], project_relevance:[{registry_id,relevance,why}]}.
relationship ∈ similar|contradicts|depends_on|extends. Answer "how does this help something already important?".`),
      prompt: v(`NEW ITEM:\n${x.item || ""}\n\nNEIGHBORS:\n${x.neighbors || ""}\n\nPROJECT REGISTRY:\n${x.registry || ""}`),
    }),
  },
  assistance: {
    key: "assistance",
    version: "1.0.0",
    tier: "strong",
    build: (x) => ({
      system: v(`You are RADIAN's chief-of-staff. Produce project-anchored, specific suggested actions for a capture,
never generic. Return JSON: {playbook?, suggestions:[{text,project,confidence}], next_actions:[{action,project,effort,leverage,confidence}]}.
effort ∈ S|M|L, leverage ∈ LOW|MED|HIGH.`),
      prompt: v(`CAPTURE:\n${x.capture || ""}\n\nPROJECT OBJECTIVES:\n${x.objectives || ""}`),
    }),
  },
  daily_brief: {
    key: "daily_brief",
    version: "1.0.0",
    tier: "strong",
    build: (x) => ({
      system: v(`You are RADIAN. Write a 3-sentence daily brief + 1-3 urgent actions, organized by the owner's projects.
Return JSON: {summary, urgent_actions:[{text,project,priority}]}.`),
      prompt: v(`LAST 24H:\n${x.recent || ""}\n\nOPEN REVIEWS:\n${x.reviews || ""}`),
    }),
  },
  opportunity: {
    key: "opportunity",
    version: "1.0.0",
    tier: "strong",
    build: (x) => ({
      system: v(`You are RADIAN's systems thinker. Find cross-domain intersections across the graph and propose Opportunity nodes.
Return JSON: {opportunities:[{thesis,contributing_nodes,confidence,leverage,first_move,decay_days}]}. leverage ∈ LOW|MED|HIGH.`),
      prompt: v(`GRAPH SNAPSHOT:\n${x.graph || ""}\n\nPROJECTS:\n${x.projects || ""}`),
    }),
  },
};

export function getPrompt(key: string, override?: { version: string }): PromptDef {
  const base = PROMPTS[key];
  if (!base) throw new Error(`unknown_prompt:${key}`);
  // A DB override may pin/replace the active version (Meta-Radian bump path).
  return override ? { ...base, version: override.version } : base;
}
