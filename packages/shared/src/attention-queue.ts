// Sprint 4 — Attention Queue: "what needs you now."
// A PURE, deterministic ranker (no LLM, no I/O) that turns the owner's real signals —
// inbox backlog, blocked/overdue quests, resurfaced forgotten gems, open reviews — into a
// short, scored "do this next" list. Built on the B6 attention primitives (`attentionScore`)
// so importance/urgency/recency/signal are weighed together (the loudest input never wins
// automatically), and it honours the Sprint 2b feedback signal: a DISMISSED item is dropped,
// "not useful" is demoted, "useful" is boosted. Proposal-only — it ranks, never mutates.
import { attentionScore, type AttentionInputs } from "./cognition-b";

export type AttentionKind = "triage" | "unblock" | "due" | "revisit" | "review";
export type AttentionBand = "now" | "soon" | "later";
export type FeedbackKind = "useful" | "not_useful" | "wrong_connection" | "dismiss";

export interface AttentionCandidate {
  id: string;
  kind: AttentionKind;
  title: string;
  inputs: AttentionInputs;
  reason: string;
  // What the owner does about it — the PWA maps verb → a route/action.
  action: { label: string; verb: string; subjectType?: string; subjectId?: string };
  feedback?: FeedbackKind | null;
}

export interface AttentionItem extends AttentionCandidate {
  score: number;
  band: AttentionBand;
}

const bandFor = (score: number): AttentionBand => (score >= 70 ? "now" : score >= 45 ? "soon" : "later");

/** Rank candidates into a short attention queue. Dismissed items are excluded; "not useful"
 *  is demoted; "useful" is boosted. Deterministic: ties break by kind priority then id. */
export function buildAttentionQueue(candidates: AttentionCandidate[], limit = 7): AttentionItem[] {
  const KIND_PRIORITY: Record<AttentionKind, number> = { unblock: 0, due: 1, triage: 2, review: 3, revisit: 4 };
  const items: AttentionItem[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (c.feedback === "dismiss") continue; // owner said no — never resurface
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    let score = attentionScore(c.inputs);
    if (c.feedback === "useful") score = Math.min(100, score + 12);
    else if (c.feedback === "not_useful") score = Math.round(score * 0.6);
    items.push({ ...c, score, band: bandFor(score) });
  }
  items.sort((a, b) => (b.score - a.score) || (KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]) || a.id.localeCompare(b.id));
  return items.slice(0, Math.max(0, limit));
}

/** Days since an ISO timestamp (>= 0). Missing → a large number (treated as stale). */
export function ageDays(iso?: string | null, now = Date.now()): number {
  if (!iso) return 999;
  return Math.max(0, (now - new Date(iso).getTime()) / 86400000);
}

/** Inbox backlog grows louder with age: urgency ramps to 100 over ~10 days. */
export function inboxUrgency(captureAgeDays: number): number {
  return Math.max(20, Math.min(100, Math.round(captureAgeDays * 10)));
}
