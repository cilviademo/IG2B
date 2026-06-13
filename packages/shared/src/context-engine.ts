// Living OS (Wave G11) — Context Engineering Engine. Goal-driven, token-budgeted, dynamic
// retrieval: given a GOAL, select only the most relevant slice of the vault that fits a
// token budget — instead of dumping everything. DETERMINISTIC + EXPLAINABLE: relevance is
// a transparent blend of lexical overlap, tag match, semantic similarity (passed in from
// embeddings), value, recency, item kind and a hot-cache boost. No LLM. This is the seam
// that lets the Boardroom / Mentor / ask paths send tight packs, not the whole graph.

export type ContextKind = "node" | "decision" | "quest" | "research" | "brief";

export interface ContextCandidate {
  id: string;
  kind: ContextKind;
  title: string;
  text: string;          // the body that would be sent (counts toward the budget)
  tags?: string[];
  mvs?: number;
  recencyDays?: number;
  semantic?: number;     // 0..1 cosine similarity to the goal (optional)
  hot?: boolean;         // recently used (hot cache)
}
export interface ScoredCandidate extends ContextCandidate { score: number; reasons: string[]; tokens: number }
export interface ContextPlan {
  goal: string;
  budget: number;
  tokensUsed: number;
  included: ScoredCandidate[];
  excludedCount: number;
  sections: { kind: ContextKind; items: { id: string; title: string }[] }[];
  bootstrap: boolean;
}

// ~4 chars/token — the same rough estimate the model layer uses. (Local, not exported:
// the model layer already exports an `estTokens`.)
const estTokens = (s: string) => Math.max(1, Math.ceil((s || "").length / 4));

/** Transparent relevance score (0..1) of a candidate against the goal. */
export function scoreCandidate(goal: string, c: ContextCandidate): { score: number; reasons: string[] } {
  const g = (goal || "").toLowerCase();
  const gwords = new Set(g.split(/\W+/).filter((w) => w.length > 2));
  const hay = `${c.title} ${(c.tags || []).join(" ")}`.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  let lex = 0;
  for (const w of gwords) if (hay.includes(w)) lex++;
  if (lex) { score += Math.min(0.4, lex * 0.12); reasons.push(`${lex} goal term${lex > 1 ? "s" : ""}`); }

  if ((c.tags || []).some((t) => t && g.includes(t.toLowerCase()))) { score += 0.15; reasons.push("tag"); }
  if (c.semantic != null && c.semantic > 0.2) { score += c.semantic * 0.4; reasons.push(`semantic ${Math.round(c.semantic * 100)}%`); }
  if (c.mvs != null) score += (c.mvs / 100) * 0.15;
  if (c.recencyDays != null) {
    const r = c.recencyDays <= 14 ? 0.12 : c.recencyDays <= 45 ? 0.06 : 0;
    score += r; if (r >= 0.12) reasons.push("recent");
  }
  if (c.kind === "decision") { score += 0.08; reasons.push("decision"); }
  else if (c.kind === "research") { score += 0.06; reasons.push("research"); }
  else if (c.kind === "quest") { score += 0.05; reasons.push("active quest"); }
  if (c.hot) { score += 0.1; reasons.push("hot cache"); }

  return { score: Math.min(1, score), reasons };
}

/** Rank candidates by relevance and greedily pack the highest-value items that fit the
 *  token budget — leaving the rest of the vault out. Returns the plan + grouped sections. */
export function assembleContext(goal: string, candidates: ContextCandidate[], budget = 4000): ContextPlan {
  const scored = candidates
    .map((c) => { const { score, reasons } = scoreCandidate(goal, c); return { ...c, score, reasons, tokens: estTokens(c.text) }; })
    .filter((c) => c.score > 0.05)
    .sort((a, b) => b.score - a.score);

  const included: ScoredCandidate[] = [];
  let used = 0;
  for (const c of scored) {
    if (used + c.tokens > budget) continue; // skip the too-big, keep packing smaller high-value ones
    included.push(c); used += c.tokens;
  }

  const byKind = new Map<ContextKind, { id: string; title: string }[]>();
  for (const c of included) {
    if (!byKind.has(c.kind)) byKind.set(c.kind, []);
    byKind.get(c.kind)!.push({ id: c.id, title: c.title });
  }
  const order: ContextKind[] = ["node", "research", "decision", "quest", "brief"];
  const sections = order.filter((k) => byKind.has(k)).map((k) => ({ kind: k, items: byKind.get(k)! }));

  return {
    goal, budget, tokensUsed: used, included,
    excludedCount: candidates.length - included.length,
    sections, bootstrap: included.length === 0,
  };
}
