// Cognition Wave C stub test — pure logic, no DB/network.
//   npx tsx packages/shared/scripts/cognition-waveC-verify.ts

import {
  assignMemoryTier, findResurrectionCandidates, deterministicReview, parseReview,
  simulationGroundingBlock,
} from "../src/cognition-c";
import type { GraphNode } from "../src/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };
const days = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
function node(id: string, title: string, mvs: number, tags: string[], updated: string, summary = title): GraphNode & { updated_at: string } {
  return { id, user_id: "u", type: "concept", title, summary, truth_layer: "C", truth_label: "x", mvs, tags, updated_at: updated } as GraphNode & { updated_at: string };
}

async function main() {
  // C1 memory tiers
  ok("referenced -> working", assignMemoryTier({ mvs: 80 }, true) === "working");
  ok("unreferenced -> long_term", assignMemoryTier({ mvs: 80 }, false) === "long_term");
  ok("core is sticky (owner-only)", assignMemoryTier({ mvs: 20, current_tier: "core" }, false) === "core");

  // C3 shadow memory
  const nodes = [
    node("fresh", "Active thing", 90, ["dsp"], days(1)),
    node("gem", "Forgotten DSP gem", 85, ["dsp", "modulation"], days(120)),
    node("lowstale", "Old low-value note", 30, ["misc"], days(120)),
    node("ctx", "Sampling technique", 55, ["sampling", "audio"], days(200)),
  ];
  const shadow = findResurrectionCandidates(nodes, { text: "audio sampling modulation dsp", tags: ["audio", "sampling"] });
  ok("surfaces a forgotten high-value gem", shadow.some((c) => c.id === "gem" && c.kind === "forgotten_gem"), JSON.stringify(shadow));
  ok("surfaces a context-changed abandoned idea", shadow.some((c) => c.id === "ctx"), JSON.stringify(shadow));
  ok("does NOT resurrect fresh node", !shadow.some((c) => c.id === "fresh"));
  ok("does NOT resurrect old low-value note", !shadow.some((c) => c.id === "lowstale"));

  // C2 reviews — compounding
  const r1 = deterministicReview({
    timescale: "monthly", topNodes: [{ title: "Quartz", mvs: 92 }, { title: "BTZ", mvs: 80 }],
    eventCounts: [{ event_type: "capture_created", count: 14 }], calibrationNote: "Well calibrated.",
    shadow,
  });
  ok("monthly review summarizes", r1.summary.length > 0 && r1.themes.includes("Quartz"));
  ok("monthly review carries From-the-vault", r1.from_the_vault.length > 0);
  const r2 = deterministicReview({ timescale: "monthly", topNodes: [], eventCounts: [], priorSummary: r1.summary });
  ok("review compounds on the prior", !!r2.compounded_on && r2.compounded_on.includes("Building on last monthly"));
  ok("quarterly review has no shadow section", deterministicReview({ timescale: "quarterly", topNodes: [], eventCounts: [], shadow }).from_the_vault.length === 0);
  ok("parseReview accepts valid JSON", parseReview('{"summary":"s","themes":["t"],"blind_spots":["b"]}', "monthly")?.themes.length === 1);
  ok("parseReview rejects junk", parseReview("nope", "monthly") === null);

  // C6 simulation grounding
  const g = simulationGroundingBlock({ constraints: "Weekly time available: 6h", calibrationNote: "Overconfident." });
  ok("grounding includes constraints", g.includes("CONSTRAINTS") && g.includes("6h"));
  ok("grounding includes calibration", g.includes("Overconfident"));
  ok("empty grounding is empty", simulationGroundingBlock({}) === "");

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
