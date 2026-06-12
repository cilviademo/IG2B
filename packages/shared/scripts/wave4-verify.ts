// Wave 4 (Stages 6/10/11) stub test — pure, deterministic, no DB/network.
//   npx tsx packages/shared/scripts/wave4-verify.ts   (expects ALL PASS)

import {
  AGENT_KINDS, executorEnabled, deterministicAgentArtifact, parseAgentArtifact,
  deterministicSimulation, parseSimulation,
  deterministicMetaMemo, parseMetaMemo, type MetaStats,
} from "../src/radian-stages4";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

async function main() {
  // Stage 6 — executors OFF by default (proposal-only)
  ok("executors default OFF", AGENT_KINDS.every((k) => executorEnabled(k, {}) === false));
  ok("executor opt-in respected", executorEnabled("coding", { RADIAN_EXECUTOR_CODING: "true" }) === true);
  const art = deterministicAgentArtifact("coding", { title: "Add saturation", summary: "DSP module" });
  ok("coding artifact drafts a branch plan", /branch/i.test(art.body) && art.kind === "coding");
  ok("all kinds draft something", AGENT_KINDS.every((k) => deterministicAgentArtifact(k, { title: "x", summary: "y" }).body.length > 0));
  ok("parseAgentArtifact accepts JSON", parseAgentArtifact('{"title":"t","body":"hello world this is a body"}', "documentation")?.title === "t");
  ok("parseAgentArtifact accepts raw markdown", !!parseAgentArtifact("# A long enough markdown body here", "documentation"));

  // Stage 10 — simulation: 2-4 paths, framed as estimate w/ assumptions
  const sim = deterministicSimulation("Should I fully invest in BTZ this month?", "context about BTZ");
  ok("simulation has 2-4 paths", sim.paths.length >= 2 && sim.paths.length <= 4);
  ok("paths have leverage in [0,1]", sim.paths.every((p) => p.expected_leverage >= 0 && p.expected_leverage <= 1));
  ok("simulation lists assumptions (estimate, not fact)", sim.assumptions.length > 0 && sim.confidence <= 1);
  ok("simulation has a recommendation", !!sim.recommendation);
  ok("parseSimulation rejects no-paths", parseSimulation('{"paths":[]}', "q") === null);
  ok("parseSimulation accepts valid", (parseSimulation('{"paths":[{"name":"A","effort":"S","risk":"LOW","dependencies":[],"expected_leverage":0.5,"tradeoffs":"t"}],"assumptions":["a"],"confidence":0.5,"recommendation":"r"}', "q")?.paths.length) === 1);

  // Stage 11 — meta memo: spend-driven + calibration + prompt-diff recommendation
  const stats: MetaStats = {
    by_purpose: [{ purpose: "assistance", cost_cents: 120, calls: 30 }, { purpose: "ingest_classify", cost_cents: 10, calls: 200 }],
    accepted_opportunities: 1, rejected_opportunities: 4, reverted_edges: 2, decision_calibration_gap: 0.2,
  };
  const memo = deterministicMetaMemo(stats);
  ok("meta memo summarizes", memo.summary.length > 0);
  ok("meta memo flags top spend", memo.recommendations.some((r) => r.area === "budget" && /assistance/.test(r.change)));
  ok("meta memo proposes a prompt version bump", memo.recommendations.some((r) => r.prompt_key === "opportunity" && !!r.proposed_version));
  ok("meta memo flags overconfidence", memo.recommendations.some((r) => r.area === "calibration"));
  ok("healthy stats -> no changes", deterministicMetaMemo({ by_purpose: [], accepted_opportunities: 0, rejected_opportunities: 0, reverted_edges: 0, decision_calibration_gap: 0 }).recommendations.length === 0);
  ok("parseMetaMemo accepts valid", parseMetaMemo('{"summary":"s","recommendations":[{"area":"prompt","change":"c","prompt_key":"k","proposed_version":"1.1.0"}]}')?.recommendations.length === 1);

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
