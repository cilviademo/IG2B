// Living OS (Wave G7) Simulation Engine stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/simulation-engine-verify.ts
// Run from the repo root.

import {
  feasibilityFrom, outcomesFor, simulateScenario, simulateComparison, parseOptions, simulate,
} from "../src/simulation-engine";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// feasibility is monotonic + bounded
const fHigh = feasibilityFrom({ momentum: "compounding", mvs: 90, recencyDays: 2, degree: 6, constraintFit: 0.9, hasData: true });
const fLow = feasibilityFrom({ momentum: "blocked", mvs: 20, recencyDays: 90, degree: 0, constraintFit: 0.2, hasData: true });
ok("feasibility in [0,1]", fHigh <= 1 && fLow >= 0);
ok("strong signals beat weak signals", fHigh > fLow + 0.3, `${fHigh} vs ${fLow}`);

// outcomes always sum to 100, likely keeps the most mass at mid feasibility
const oc = outcomesFor(0.5, "X");
ok("three bands", oc.length === 3 && oc.map((o) => o.band).join() === "best,likely,worst");
ok("probabilities sum to 100", oc.reduce((s, o) => s + o.probability, 0) === 100);
ok("likely dominates at mid feasibility", oc.find((o) => o.band === "likely")!.probability >= 40);
const ocHigh = outcomesFor(0.9, "X"), ocLow = outcomesFor(0.1, "X");
ok("higher feasibility raises best-case prob", ocHigh.find((o) => o.band === "best")!.probability > ocLow.find((o) => o.band === "best")!.probability);
ok("lower feasibility raises worst-case prob", ocLow.find((o) => o.band === "worst")!.probability > ocHigh.find((o) => o.band === "worst")!.probability);

// scenario
const sc = simulateScenario("What happens if I ship BTZ TRACE?", { momentum: "accelerating", mvs: 85, recencyDays: 3, degree: 4, hasData: true });
ok("scenario has 3 outcomes + recommendation", sc.kind === "scenario" && sc.outcomes!.length === 3 && sc.recommendation.length > 0);
ok("favorable scenario → proceed", /proceed/i.test(sc.recommendation));
ok("scenario is always an estimate", sc.estimate === true);
ok("assumptions include the estimate disclaimer", sc.assumptions.some((a) => /estimate/i.test(a)));

// sparse scenario → bootstrap, low confidence, no fabricated confidence
const sparse = simulateScenario("What happens if I try something new?", { hasData: false });
ok("sparse scenario → bootstrap + low confidence", sparse.bootstrap && sparse.confidence <= 0.25);

// comparison parsing + ranking
ok("parses 'A vs B vs C'", parseOptions("SLECP-A vs OTS vs Warrant").length === 3);
ok("parses 'A or B'", parseOptions("BTZ or TRACE").length === 2);
ok("single question is not a comparison", parseOptions("what happens if I rest?").length === 0);
const cmp = simulateComparison("A vs B", [
  { name: "A", sig: { momentum: "compounding", mvs: 90, hasData: true } },
  { name: "B", sig: { momentum: "dormant", mvs: 30, hasData: true } },
]);
ok("comparison ranks the stronger option first", cmp.kind === "comparison" && cmp.options![0].name === "A");
ok("comparison recommends leading with the top", /Lead with A/.test(cmp.recommendation));
ok("each option carries best/likely/worst", cmp.options!.every((o) => o.outcomes.length === 3));

// no-data comparison → honest, not fabricated
const blind = simulateComparison("X vs Y", [{ name: "X" }, { name: "Y" }]);
ok("no-data comparison → insufficient-data recommendation", blind.bootstrap && /insufficient data/i.test(blind.recommendation));

// dispatch
ok("simulate() routes 'A vs B' to comparison", simulate({ question: "Path A vs Path B" }).kind === "comparison");
ok("simulate() routes a plain question to scenario", simulate({ question: "what happens if I focus?", signals: { hasData: true, mvs: 60 } }).kind === "scenario");

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
