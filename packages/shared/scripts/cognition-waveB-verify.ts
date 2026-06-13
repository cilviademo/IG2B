// Cognition Wave B stub test — pure logic, no DB/network.
//   npx tsx packages/shared/scripts/cognition-waveB-verify.ts

import {
  EPISTEMIC_TYPES, isEpistemicType, EPISTEMIC_GLYPH,
  CAUSAL_EDGE_TYPES, mapLegacyEdge, DIRECTIONAL_EDGES, EVIDENCE_EDGES,
  LIFECYCLE_BY_KIND, isValidTransition, transitionNeedsConfirmation,
  DEFAULT_CONSTRAINTS, reconcileAgainstConstraints, constraintPromptBlock,
  attentionScore, urgencyFromDate, computeSignalToNoise, type ConstraintProfile,
} from "../src/cognition-b";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

async function main() {
  // B1 epistemic
  ok("8 epistemic types", EPISTEMIC_TYPES.length === 8);
  ok("epistemic glyphs cover all", EPISTEMIC_TYPES.every((t) => !!EPISTEMIC_GLYPH[t]));
  ok("isEpistemicType gates unknown", isEpistemicType("hypothesis") && !isEpistemicType("vibes"));

  // B2 causal edges
  ok("9 causal edge types", CAUSAL_EDGE_TYPES.length === 9);
  ok("legacy relates_to maps to supports", mapLegacyEdge("relates_to") === "supports");
  ok("causes is directional", DIRECTIONAL_EDGES.has("causes") && !DIRECTIONAL_EDGES.has("supports"));
  ok("evidence edges identified", EVIDENCE_EDGES.has("evidence_for") && EVIDENCE_EDGES.has("evidence_against"));

  // B3 lifecycle
  ok("project lifecycle has all states", LIFECYCLE_BY_KIND.project.length === 8);
  ok("forward transition valid", isValidTransition("project", "idea", "building"));
  ok("backward transition invalid (except archive)", !isValidTransition("project", "building", "idea") && isValidTransition("project", "building", "archived"));
  ok("past research needs confirmation", transitionNeedsConfirmation("building") && !transitionNeedsConfirmation("research"));

  // B4 constraint engine — the gate: a plan visibly flags violations
  const profile: ConstraintProfile = { weekly_hours: 6, max_concurrent_builds: 2 };
  const heavy = reconcileAgainstConstraints([
    { action: "Big build", effort: "L", project: "p1" },
    { action: "Another big build", effort: "L", project: "p2" },
    { action: "Third", effort: "M", project: "p3" },
  ], profile);
  ok("over-budget plan flags hours violation", !heavy.ok && heavy.violations.some((v) => /needs ~\d+h\/wk/.test(v)), JSON.stringify(heavy.violations));
  ok("too many concurrent projects flagged", heavy.violations.some((v) => /focus limit/.test(v)));
  const light = reconcileAgainstConstraints([{ action: "Small", effort: "S", project: "p1" }], profile);
  ok("within-budget plan is ok", light.ok && light.violations.length === 0);
  ok("constraint prompt block renders profile", constraintPromptBlock(profile).includes("Weekly time available: 6h"));
  ok("default constraints sane", DEFAULT_CONSTRAINTS.weekly_hours > 0);

  // B6 attention — the loudest input must not always win
  const highMvsStale = attentionScore({ importance: 95, urgency: 10, recencyDays: 60, signal: 0.3 });
  const midUrgentFresh = attentionScore({ importance: 55, urgency: 95, recencyDays: 1, signal: 0.9 });
  ok("urgent+fresh can outrank stale high-MVS", midUrgentFresh > highMvsStale, `${midUrgentFresh} vs ${highMvsStale}`);
  ok("attention bounded 0..100", [highMvsStale, midUrgentFresh].every((s) => s >= 0 && s <= 100));
  ok("urgency: overdue date = max", urgencyFromDate(new Date(Date.now() - 86400000).toISOString()) === 100);
  ok("urgency: far date = low", urgencyFromDate(new Date(Date.now() + 30 * 86400000).toISOString()) < 20);
  ok("no date = neutral urgency", urgencyFromDate(undefined) === 30);

  // B6 signal-to-noise learned from accept/reject events
  const stn = computeSignalToNoise([
    { event_type: "suggestion_accepted", payload: { source: "github" } },
    { event_type: "suggestion_accepted", payload: { source: "github" } },
    { event_type: "suggestion_rejected", payload: { source: "instagram" } },
    { event_type: "suggestion_rejected", payload: { source: "instagram" } },
  ]);
  ok("accepted source has higher signal than rejected", (stn.github ?? 0) > (stn.instagram ?? 1), JSON.stringify(stn));

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
