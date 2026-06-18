// Auto-linking (Intelligence) — when a new memory node is embedded, connect it to its most
// similar existing nodes so the graph builds itself. DETERMINISTIC + PURE: given ranked neighbors
// (cosine scores), pick the edges to create — above a similarity threshold, capped at K, skipping
// self and already-linked targets. Works on the deterministic embedder floor (no model/key) and
// gets sharper when a real embedding provider is configured. The actual ranking + edge writes
// live in the worker; this is the decision rule so it's testable.

export interface ScoredNeighbor { subject_id: string; score: number }
export interface AutoLink { target_id: string; weight: number }

/** Pick auto-link edges from ranked neighbors. threshold filters weak matches, k caps fan-out,
 *  existingTargetIds prevents duplicate edges. Deterministic + order-preserving (already sorted). */
export function selectAutoLinks(
  scored: ScoredNeighbor[],
  opts: { threshold?: number; k?: number; existingTargetIds?: Set<string> } = {},
): AutoLink[] {
  const threshold = opts.threshold ?? 0.7;
  const k = Math.max(0, opts.k ?? 3);
  const existing = opts.existingTargetIds ?? new Set<string>();
  const seen = new Set<string>();
  const out: AutoLink[] = [];
  for (const s of scored) {
    if (out.length >= k) break;
    const id = s?.subject_id;
    if (!id || existing.has(id) || seen.has(id)) continue;
    if (!Number.isFinite(s.score) || s.score < threshold) continue;
    seen.add(id);
    out.push({ target_id: id, weight: Math.min(1, Math.max(0, Number(s.score.toFixed(3)))) });
  }
  return out;
}
