// Advanced memory scoring (Tier-3 idea). Today a node's value is one number (`mvs`). This
// decomposes it into TRANSPARENT factors — importance · recency · reuse · confidence · connection
// density · citation frequency · novelty — and recomposes a 0–100 composite plus the per-factor
// breakdown, so Atlas can show WHY a node ranks (and retrieval/auto-link/World Lens get sharper).
// PURE + deterministic (no model/key); factor gathering (edges/events) lives in the api.

export interface MemoryFactors {
  importance?: number;         // 0..100 — the seed value (current mvs / actionability)
  recencyDays?: number;        // days since last touched (fresher = higher)
  reuseCount?: number;         // times opened / referenced
  confidence?: number;         // 0..1 — model-reasoned + evidence-backed
  connectionDensity?: number;  // graph degree (edges touching it)
  citationFrequency?: number;  // times cited as a source in answers / context packs
  novelty?: number;            // 0..1 — how distinct from existing memory (1 = novel)
}

export interface MemoryScore { score: number; components: Record<string, number>; weights: Record<string, number> }

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
// log-saturating normaliser: 0 → 0, grows, saturates ~1 near `sat`.
const logSat = (n: number, sat: number) => (n <= 0 ? 0 : clamp01(Math.log2(1 + n) / Math.log2(1 + Math.max(1, sat))));

// Transparent weights (sum = 1). Importance leads; reuse + recency reward living memory.
const WEIGHTS = {
  importance: 0.30,
  recency: 0.15,
  reuse: 0.15,
  confidence: 0.15,
  connection: 0.10,
  citation: 0.10,
  novelty: 0.05,
} as const;

/** Compose the multi-factor memory score (0..100) + the normalized per-factor breakdown (0..1). */
export function memoryScore(f: MemoryFactors): MemoryScore {
  const recency = f.recencyDays == null ? 0.5 : clamp01(1 - f.recencyDays / 180); // fresh→1, ~6mo→0
  const components = {
    importance: clamp01((f.importance ?? 50) / 100),
    recency,
    reuse: logSat(f.reuseCount ?? 0, 20),
    confidence: clamp01(f.confidence ?? 0.5),
    connection: logSat(f.connectionDensity ?? 0, 12),
    citation: logSat(f.citationFrequency ?? 0, 15),
    novelty: clamp01(f.novelty ?? 0.5),
  };
  const composite =
    components.importance * WEIGHTS.importance +
    components.recency * WEIGHTS.recency +
    components.reuse * WEIGHTS.reuse +
    components.confidence * WEIGHTS.confidence +
    components.connection * WEIGHTS.connection +
    components.citation * WEIGHTS.citation +
    components.novelty * WEIGHTS.novelty;
  return { score: Math.round(clamp01(composite) * 100), components, weights: { ...WEIGHTS } };
}

/** The single biggest lever on a node's score (for a "to raise this: …" hint in the UI). */
export function topMemoryFactor(s: MemoryScore): { factor: string; value: number } {
  let factor = "importance", value = -1;
  for (const [k, v] of Object.entries(s.components)) if (v * (s.weights[k] ?? 0) > value) { value = v * (s.weights[k] ?? 0); factor = k; }
  return { factor, value: s.components[factor] };
}
