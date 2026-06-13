// Semantic memory — embedding adapters + cosine retrieval. Activated now that
// pgvector is confirmed live (v0.8.1). Provider-agnostic behind one seam:
//   - openai   (text-embedding-3-small, 1536)  — needs OPENAI_API_KEY
//   - voyage   (voyage-3-lite, 512)            — needs VOYAGE_API_KEY
//   - deterministic (32-dim hash)              — no key; sandbox/offline fallback
// Vectors are stored in the `embeddings` table; retrieval is cosine similarity
// (native pgvector `<=>` is a drop-in perf upgrade — see docs). Keys never logged.

export type EmbedProvider = "openai" | "voyage" | "deterministic";
export interface EmbedResult { vector: number[]; tokens: number }
export interface Embedder {
  readonly provider: EmbedProvider;
  readonly model: string;
  readonly dim: number;
  embed(text: string): Promise<EmbedResult>;
}

type Env = Record<string, string | undefined>;
const estTokens = (s: string) => Math.ceil((s || "").split(/\s+/).filter(Boolean).length * 1.34) + 8;

// Deterministic 32-dim hash embedding — stable, cheap, key-free. Good enough to
// keep the whole pipeline working offline; a real provider replaces it transparently.
function deterministicEmbed(text: string, dim = 32): number[] {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    v[c % dim] += ((c % 13) - 6) / 6;
    v[(c * 7 + i) % dim] += Math.sin(c + i) * 0.5;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function deterministicEmbedder(dim = 32): Embedder {
  return { provider: "deterministic", model: `det-${dim}`, dim, async embed(t) { return { vector: deterministicEmbed(t, dim), tokens: estTokens(t) }; } };
}

function openaiEmbedder(apiKey: string, model = "text-embedding-3-small", dim = 1536): Embedder {
  return {
    provider: "openai", model, dim,
    async embed(text) {
      const r = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      });
      if (!r.ok) throw new Error(`openai_embed_${r.status}`);
      const j = (await r.json()) as { data?: { embedding: number[] }[]; usage?: { total_tokens?: number } };
      const vector = j.data?.[0]?.embedding ?? [];
      if (!vector.length) throw new Error("openai_embed_empty");
      return { vector, tokens: j.usage?.total_tokens ?? estTokens(text) };
    },
  };
}

function voyageEmbedder(apiKey: string, model = "voyage-3-lite", dim = 512): Embedder {
  return {
    provider: "voyage", model, dim,
    async embed(text) {
      const r = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      });
      if (!r.ok) throw new Error(`voyage_embed_${r.status}`);
      const j = (await r.json()) as { data?: { embedding: number[] }[]; usage?: { total_tokens?: number } };
      const vector = j.data?.[0]?.embedding ?? [];
      if (!vector.length) throw new Error("voyage_embed_empty");
      return { vector, tokens: j.usage?.total_tokens ?? estTokens(text) };
    },
  };
}

/** Resolve the active embedder. Semantic memory turns on when RADIAN_EMBED=on AND a
 *  provider key is present; otherwise the deterministic embedder keeps things working. */
export function getEmbedder(env: Env = process.env): Embedder {
  const on = (env.RADIAN_EMBED || "").toLowerCase() === "on";
  const want = (env.RADIAN_EMBED_PROVIDER || "").toLowerCase();
  if (on && (want === "openai" || (!want && env.OPENAI_API_KEY)) && env.OPENAI_API_KEY) {
    return openaiEmbedder(env.OPENAI_API_KEY, env.RADIAN_EMBED_MODEL || "text-embedding-3-small", Number(env.RADIAN_EMBED_DIM) || 1536);
  }
  if (on && (want === "voyage" || (!want && env.VOYAGE_API_KEY)) && env.VOYAGE_API_KEY) {
    return voyageEmbedder(env.VOYAGE_API_KEY, env.RADIAN_EMBED_MODEL || "voyage-3-lite", Number(env.RADIAN_EMBED_DIM) || 512);
  }
  return deterministicEmbedder(Number(env.RADIAN_EMBED_DIM) || 32);
}
export function embeddingsEnabled(env: Env = process.env): boolean {
  return getEmbedder(env).provider !== "deterministic";
}

// ---- cosine retrieval ----
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

export interface EmbeddingRow { subject_type: string; subject_id: string; model: string; vector: number[] }
export interface SemanticMatch { subject_type: string; subject_id: string; score: number }

/** Rank stored embeddings against a query vector (same model only). The native
 *  pgvector path replaces this with `ORDER BY embedding <=> $1 LIMIT k`. */
export function cosineRank(queryVector: number[], rows: EmbeddingRow[], k: number, excludeId?: string): SemanticMatch[] {
  return rows
    .filter((r) => r.subject_id !== excludeId && r.vector.length === queryVector.length)
    .map((r) => ({ subject_type: r.subject_type, subject_id: r.subject_id, score: cosine(queryVector, r.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Stable content hash so we re-embed only when content changes (cost discipline).
export function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
