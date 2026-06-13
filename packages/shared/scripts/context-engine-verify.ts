// Living OS (Wave G11) Context Engineering stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/context-engine-verify.ts
// Run from the repo root.

import { scoreCandidate, assembleContext, type ContextCandidate } from "../src/context-engine";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const goal = "Help me build BTZ TRACE";

// scoring is transparent + monotonic
const onTopic = scoreCandidate(goal, { id: "a", kind: "node", title: "BTZ TRACE analyzer", text: "x", tags: ["dsp"], mvs: 90, recencyDays: 3, semantic: 0.8 });
const offTopic = scoreCandidate(goal, { id: "b", kind: "node", title: "Grocery list", text: "x", tags: ["home"], mvs: 20, recencyDays: 200, semantic: 0.05 });
ok("on-topic scores higher than off-topic", onTopic.score > offTopic.score + 0.3, `${onTopic.score} vs ${offTopic.score}`);
ok("score is bounded 0..1", onTopic.score <= 1 && offTopic.score >= 0);
ok("reasons explain the match (semantic + goal terms)", onTopic.reasons.some((r) => /semantic/.test(r)) && onTopic.reasons.some((r) => /goal term/.test(r)));
ok("hot cache + decision/research add signal", scoreCandidate(goal, { id: "h", kind: "decision", title: "Ship BTZ TRACE", text: "x", hot: true }).reasons.join().includes("hot cache"));

// assembly: relevant first, budget enforced, irrelevant dropped
const big = "x".repeat(4000); // ~1000 tokens
const cands: ContextCandidate[] = [
  { id: "n1", kind: "node", title: "BTZ TRACE core", text: "BTZ TRACE core dsp", tags: ["dsp"], mvs: 92, recencyDays: 2, semantic: 0.9 },
  { id: "n2", kind: "research", title: "DSP papers for BTZ TRACE", text: "spectral analysis", semantic: 0.6, recencyDays: 5 },
  { id: "n3", kind: "decision", title: "BTZ TRACE: ship analyzer", text: "decided to ship" },
  { id: "n4", kind: "quest", title: "Advance BTZ TRACE", text: "active" },
  { id: "x1", kind: "node", title: "Unrelated cooking note", text: "pasta recipe", tags: ["food"], mvs: 10, recencyDays: 300, semantic: 0.02 },
  { id: "big", kind: "node", title: "BTZ TRACE huge dump", text: big, semantic: 0.7 }, // relevant but too big for a tiny budget
];

const plan = assembleContext(goal, cands, 800);
ok("irrelevant item excluded", !plan.included.some((c) => c.id === "x1"));
ok("relevant items included", plan.included.some((c) => c.id === "n1") && plan.included.some((c) => c.id === "n2"));
ok("oversized item skipped to stay in budget", !plan.included.some((c) => c.id === "big") && plan.tokensUsed <= 800);
ok("included sorted by score (desc)", plan.included.every((c, i) => i === 0 || plan.included[i - 1].score >= c.score));
ok("sections grouped by kind", plan.sections.some((s) => s.kind === "node") && plan.sections.some((s) => s.kind === "decision"));
ok("excludedCount accounts for the rest", plan.excludedCount === cands.length - plan.included.length);

// a generous budget pulls in the big relevant item too
const plan2 = assembleContext(goal, cands, 4000);
ok("bigger budget includes the large relevant item", plan2.included.some((c) => c.id === "big"));

// empty / irrelevant goal → bootstrap
const none = assembleContext("xyzzy nonsense", [{ id: "z", kind: "node", title: "BTZ TRACE", text: "x" }], 4000);
ok("no relevant candidates → bootstrap", none.bootstrap && none.included.length === 0);

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
