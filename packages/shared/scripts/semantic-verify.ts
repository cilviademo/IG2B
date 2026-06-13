// Semantic memory stub test — pure logic, no DB/network.
//   npx tsx packages/shared/scripts/semantic-verify.ts

import {
  getEmbedder, deterministicEmbedder, embeddingsEnabled, cosine, cosineRank, contentHash,
  type EmbeddingRow,
} from "../src/embeddings";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

async function main() {
  // embedder selection (env-driven; deterministic without a key)
  ok("no key -> deterministic embedder", getEmbedder({}).provider === "deterministic");
  ok("embeddingsEnabled false without key", embeddingsEnabled({}) === false);
  ok("RADIAN_EMBED=on + OPENAI key -> openai", getEmbedder({ RADIAN_EMBED: "on", OPENAI_API_KEY: "sk-x" }).provider === "openai");
  ok("RADIAN_EMBED=on + VOYAGE key -> voyage", getEmbedder({ RADIAN_EMBED: "on", VOYAGE_API_KEY: "vk", RADIAN_EMBED_PROVIDER: "voyage" }).provider === "voyage");
  ok("off without RADIAN_EMBED even with key", getEmbedder({ OPENAI_API_KEY: "sk-x" }).provider === "deterministic");

  // deterministic embed is stable + unit-norm
  const det = deterministicEmbedder(32);
  const a = await det.embed("DSP modulation audio plugin");
  const a2 = await det.embed("DSP modulation audio plugin");
  ok("deterministic embed is 32-dim", a.vector.length === 32);
  ok("deterministic embed is repeatable", JSON.stringify(a.vector) === JSON.stringify(a2.vector));
  ok("deterministic embed is unit-norm", Math.abs(Math.hypot(...a.vector) - 1) < 1e-6);

  // cosine
  ok("cosine of identical = 1", Math.abs(cosine(a.vector, a.vector) - 1) < 1e-9);
  ok("cosine handles dim mismatch", cosine([1, 0], [1, 0, 0]) === 0);

  // cosineRank: a query ranks the most-similar stored vector first, excludes self
  const q = (await det.embed("audio modulation dsp")).vector;
  const rows: EmbeddingRow[] = [
    { subject_type: "node", subject_id: "self", model: "det-32", vector: q },
    { subject_type: "node", subject_id: "near", model: "det-32", vector: (await det.embed("dsp audio modulation effects")).vector },
    { subject_type: "node", subject_id: "far", model: "det-32", vector: (await det.embed("cooking pasta recipe dinner")).vector },
  ];
  const ranked = cosineRank(q, rows, 5, "self");
  ok("cosineRank excludes self", !ranked.some((m) => m.subject_id === "self"));
  ok("cosineRank ranks the near node above the far node", ranked[0]?.subject_id === "near", JSON.stringify(ranked));
  ok("cosineRank scores are sorted desc", ranked.every((m, i) => i === 0 || ranked[i - 1].score >= m.score));

  // content hash — re-embed only on change
  ok("content hash stable", contentHash("hello world") === contentHash("hello world"));
  ok("content hash changes with content", contentHash("a") !== contentHash("b"));

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
