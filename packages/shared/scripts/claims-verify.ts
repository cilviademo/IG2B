// Claims layer — pure.  npx tsx packages/shared/scripts/claims-verify.ts
import { aggregateConfidence, isContested, claimStale, normalizeClaim, detectTensions, type Claim, type ClaimEvidenceLink } from "../src/claims";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const link = (stance: ClaimEvidenceLink["stance"], weight = 0.8, evidence_id = "e" + Math.random()): ClaimEvidenceLink => ({ evidence_id, stance, weight });

// 1. Confidence aggregation.
{
  ok("no evidence → prior", aggregateConfidence([], 0.5) === 0.5);
  ok("all supporting → high", aggregateConfidence([link("supports"), link("supports")]) > 0.66);
  ok("all refuting → low", aggregateConfidence([link("refutes"), link("refutes")]) < 0.34);
  ok("mixed → middling", (() => { const c = aggregateConfidence([link("supports"), link("refutes")]); return c > 0.3 && c < 0.7; })());
  ok("confidence clamped 0..1", aggregateConfidence([link("supports", 100)]) <= 1 && aggregateConfidence([link("refutes", 100)]) >= 0);
}

// 2. Contested + stale.
{
  ok("contested = supports + refutes", isContested([link("supports"), link("refutes")]) && !isContested([link("supports")]));
  ok("stale when valid_until past", claimStale({ valid_until: new Date(NOW - 1).toISOString() }, NOW) && !claimStale({ valid_until: null }, NOW));
}

// 3. normalizeClaim defaults + recompute.
{
  const c = normalizeClaim({ statement: "X is true", claim_type: "bogus", subject: "n1", subject_kind: "node", evidence: [{ evidence_id: "e1", stance: "supports", weight: 0.9 }, { evidence_id: "", stance: "supports" }] }, { id: "c1" });
  ok("bad claim_type → fact", c.claim_type === "fact");
  ok("evidence with empty id dropped", c.evidence.length === 1);
  ok("confidence recomputed from evidence", c.confidence > 0.5);
  ok("empty statement → placeholder", normalizeClaim({}, { id: "c2" }).statement === "(empty claim)");
  ok("subject_kind preserved", c.subject_kind === "node");
}

// 4. Tensions: contested, stale-accepted, conflicting same-subject claims.
{
  const claims: Claim[] = [
    normalizeClaim({ statement: "A", subject: "topic1", evidence: [{ evidence_id: "e1", stance: "supports", weight: 0.9 }, { evidence_id: "e2", stance: "refutes", weight: 0.9 }] }, { id: "c1" }),
    { ...normalizeClaim({ statement: "B accepted but old", subject: "topic2", valid_until: new Date(NOW - 1).toISOString() }, { id: "c2" }), owner_status: "accepted" },
    normalizeClaim({ statement: "C strong", subject: "topic3", confidence: 0.9 }, { id: "c3" }),
    normalizeClaim({ statement: "D weak", subject: "topic3", confidence: 0.1 }, { id: "c4" }),
  ];
  const t = detectTensions(claims, NOW);
  ok("contested evidence detected", t.some((x) => x.kind === "contested_evidence" && x.claimIds.includes("c1")));
  ok("stale accepted detected", t.some((x) => x.kind === "stale_accepted" && x.claimIds.includes("c2")));
  ok("conflicting same-subject detected", t.some((x) => x.kind === "conflicting_claims" && x.subject === "topic3"));
  ok("no false tension on a lone clean claim", !t.some((x) => x.claimIds.length === 1 && x.claimIds[0] === "c3" && x.kind === "conflicting_claims"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
