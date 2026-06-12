// Wave 3 (Stages 7–9) stub test — pure, deterministic, no DB/network.
//   npx tsx packages/shared/scripts/wave3-verify.ts   (expects ALL PASS)

import { detectOpportunities, parseOpportunities, calibrate, consolidate } from "../src/radian-stages3";
import type { GraphNode } from "../src/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

function node(id: string, title: string, mvs: number, tags: string[], rel?: { registry_id: string; relevance: number }[]): GraphNode {
  return { id, user_id: "u", type: "resource", title, summary: title, truth_layer: "B", truth_label: "x", mvs, tags, meta: rel ? { project_relevance: rel } : {} } as unknown as GraphNode;
}

async function main() {
  // Stage 7 — opportunity detection: a node bridging 2 projects becomes an opportunity
  const projects = [{ id: "p1", name: "BTZ Sonic Alchemy" }, { id: "p2", name: "Indigold" }, { id: "p3", name: "Music" }];
  const nodes = [
    node("n1", "AI-assisted DSP", 90, ["dsp", "ai"], [{ registry_id: "p1", relevance: 0.7 }, { registry_id: "p2", relevance: 0.6 }]),
    node("n2", "Single-domain note", 50, ["misc"], [{ registry_id: "p3", relevance: 0.5 }]),
  ];
  const opps = detectOpportunities(nodes as never[], projects);
  ok("bridge node yields an opportunity", opps.length >= 1 && opps[0].contributing_nodes.includes("n1"));
  ok("single-project node is NOT an opportunity", !opps.some((o) => o.contributing_nodes.includes("n2")));
  ok("opportunity has thesis + first_move + decay", !!opps[0].thesis && !!opps[0].first_move && opps[0].decay_days > 0);
  ok("opportunity leverage is set", ["LOW", "MED", "HIGH"].includes(opps[0].leverage));

  // Stage 7 — parser filters invalid contributing node ids
  const parsed = parseOpportunities('{"opportunities":[{"thesis":"t","contributing_nodes":["n1","BAD"],"confidence":0.7,"leverage":"HIGH","first_move":"go","decay_days":30}]}', new Set(["n1"]));
  ok("parseOpportunities keeps valid node ids only", parsed![0].contributing_nodes.length === 1 && parsed![0].contributing_nodes[0] === "n1");

  // Stage 8 — calibration
  const cal = calibrate([
    { confidence: 0.9, outcome_success: false }, { confidence: 0.8, outcome_success: false },
    { confidence: 0.7, outcome_success: true }, { confidence: 0.5, outcome_success: null },
  ]);
  ok("calibration ignores unreviewed", cal.n === 3);
  ok("calibration detects overconfidence", cal.gap > 0 && /[Oo]verconfident/.test(cal.note));
  ok("empty calibration is safe", calibrate([]).n === 0);

  // Stage 9 — consolidation: referenced strengthen, others decay (floored), themes form
  const cn = [
    node("a", "A", 60, ["dsp"]), node("b", "B", 12, ["dsp"]), node("c", "C", 50, ["dsp"]),
    node("d", "D", 11, ["solo"]),
  ];
  const { adjustments, themes } = consolidate(cn, new Set(["a"]));
  const aAdj = adjustments.find((x) => x.id === "a");
  const dAdj = adjustments.find((x) => x.id === "d");
  ok("referenced node strengthens", !!aAdj && aAdj.after > aAdj.before);
  ok("untouched node decays", !!dAdj && dAdj.after < dAdj.before);
  ok("decay never below floor", adjustments.every((x) => x.after >= 10));
  ok("theme forms for >=3 shared tag", themes.some((t) => t.tag === "dsp" && t.node_ids.length === 3));
  ok("no theme for a lone tag", !themes.some((t) => t.tag === "solo"));

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
