// Opportunity scoring (Cognition C4) — pure.  npx tsx packages/shared/scripts/opportunity-scoring-verify.ts
import { scoreOpportunity, revenueSignal, capacityFit } from "../src/opportunity-scoring";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// 1. Composite ranks aligned+revenue over a high-confidence-only opportunity.
{
  const aligned = scoreOpportunity({ confidence: 60, alignment: 0.9, revenue: 80, urgency: 50, constraintFit: 0.8 });
  const loud = scoreOpportunity({ confidence: 100, alignment: 0.1, revenue: 10, urgency: 10, constraintFit: 0.8 });
  ok("aligned+revenue outranks confidence-only", aligned.score > loud.score, `${aligned.score} vs ${loud.score}`);
  ok("score clamps 0..100", aligned.score <= 100 && loud.score >= 0);
}

// 2. Flags surface the right conditions.
{
  ok("low alignment flagged", scoreOpportunity({ confidence: 50, alignment: 0.1, revenue: 50, urgency: 50, constraintFit: 0.8 }).flags.some((f) => /alignment/i.test(f)));
  ok("capacity strain flagged", scoreOpportunity({ confidence: 50, alignment: 0.5, revenue: 50, urgency: 50, constraintFit: 0.3 }).flags.some((f) => /capacity/i.test(f)));
  ok("high-leverage flagged", scoreOpportunity({ confidence: 50, alignment: 0.6, revenue: 80, urgency: 50, constraintFit: 0.8 }).flags.some((f) => /high-leverage/i.test(f)));
  ok("closing-soon flagged", scoreOpportunity({ confidence: 50, alignment: 0.5, revenue: 50, urgency: 90, constraintFit: 0.8 }).flags.some((f) => /closing/i.test(f)));
}

// 3. revenueSignal reads stated intent deterministically.
{
  ok("revenue terms accumulate", revenueSignal("launch a paid subscription for customers") > revenueSignal("a vague idea"));
  ok("no revenue terms → 0", revenueSignal("a quiet reflective note") === 0);
  ok("capped at 100", revenueSignal("revenue monetize launch customer grant leverage scale distribution") === 100);
  ok("deterministic", revenueSignal("paid launch") === revenueSignal("paid launch"));
}

// 4. capacityFit reflects hours + risk.
{
  ok("more hours → higher fit", capacityFit(20) > capacityFit(4));
  ok("unknown hours → moderate default", capacityFit(undefined) === 0.7);
  ok("high risk lifts, low risk dampens", capacityFit(10, "high") > capacityFit(10) && capacityFit(10, "low") < capacityFit(10));
  ok("fit stays in [0.2,1]", capacityFit(1, "low") >= 0.2 && capacityFit(40, "high") <= 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
