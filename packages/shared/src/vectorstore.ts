// Cognition Wave A — VectorStore seam. Semantic retrieval behind one interface so
// the pipeline (Stage 2 linking, Context Packs, Shadow Memory) is identical whether
// it runs on pgvector embeddings or the entity/tag fallback.
//
// pgvector VERDICT: DEFERRED — must be verified live on the Render basic-256mb
// Postgres (`CREATE EXTENSION vector`). Until then `tagEntityStore` is the active
// implementation; a pgvector-backed store implements this same interface with zero
// pipeline changes. NO external vector DB (no Pinecone) — Postgres + pgvector only.

export interface Retrievable {
  subject_type: string;
  subject_id: string;
  title: string;
  text: string; // summary/content
  tags: string[];
}
export interface VectorMatch {
  subject_type: string;
  subject_id: string;
  score: number; // 0..1-ish (higher = more related)
  why: string;
}
export interface VectorStore {
  readonly backend: string;
  available(): boolean;
  /** Rank candidates by relatedness to a query (text + optional tags). */
  search(query: { text: string; tags?: string[] }, candidates: Retrievable[], k: number): VectorMatch[];
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "your", "about", "have", "will"]);
function terms(s: string): Set<string> {
  return new Set((s || "").toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g)?.filter((w) => !STOP.has(w)) ?? []);
}

/** Fallback: entity/tag + term-overlap (Jaccard-ish). Deterministic, no embeddings.
 *  This is the seam's default until pgvector is verified live. */
export const tagEntityStore: VectorStore = {
  backend: "tag-entity",
  available: () => true,
  search(query, candidates, k) {
    const qTerms = terms(query.text);
    const qTags = new Set((query.tags || []).map((t) => t.toLowerCase()));
    return candidates
      .map((c) => {
        const cTerms = terms(`${c.title} ${c.text}`);
        let overlap = 0;
        for (const t of qTerms) if (cTerms.has(t)) overlap++;
        const tagHits = (c.tags || []).filter((t) => qTags.has(String(t).toLowerCase())).length;
        const denom = Math.max(4, qTerms.size + cTerms.size - overlap);
        const score = Math.min(1, overlap / denom + tagHits * 0.12);
        return { subject_type: c.subject_type, subject_id: c.subject_id, score, why: tagHits ? `${tagHits} shared tag(s)` : `${overlap} shared term(s)` };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  },
};

/** Resolve the active store. A pgvector store would be returned here when the
 *  extension is verified + an embeddings provider is configured. */
export function getVectorStore(): VectorStore {
  // TODO(owner live-check): return a pgvector-backed store once CREATE EXTENSION
  // vector is confirmed on the basic-256mb instance (see docs/state/directives/COGNITION_PHASE0.md).
  return tagEntityStore;
}
