// World Lens — pure.  npx tsx packages/shared/scripts/world-lens-verify.ts
import { worldLens, lexicalRelevant } from "../src/world-lens";
import { normalizeEvidence } from "../src/evidence";
import { normalizeClaim } from "../src/claims";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

const ev = (over: Record<string, unknown>, i: number) => normalizeEvidence({ source_kind: "rss", source_name: "Feed", ...over }, { id: `e${i}`, connector: "rss", now: NOW });

// 1. lexicalRelevant needs ≥2 shared meaningful terms.
{
  const terms = new Set(["sonic", "alchemy", "trace"]);
  ok("≥2 shared terms → relevant", lexicalRelevant("Sonic Alchemy update", terms));
  ok("1 shared term → not relevant", !lexicalRelevant("Sonic news", terms));
  ok("empty terms → not relevant", !lexicalRelevant("anything here", new Set()));
}

// 2. Grouping + relevance filter.
{
  const lens = worldLens({
    subject: "n1", subjectTitle: "BTZ Sonic Alchemy", subjectTerms: ["btz"],
    evidence: [
      ev({ title: "Sonic Alchemy breakthrough", summary: "btz sonic alchemy", status: "new" }, 1),
      ev({ title: "Refuting Sonic Alchemy", summary: "btz sonic alchemy", status: "contradictory" }, 2),
      ev({ title: "Correction to Alchemy", summary: "btz sonic alchemy", status: "corrected" }, 3),
      ev({ title: "Totally unrelated cooking recipe", summary: "pasta tomato basil", status: "new" }, 4),
    ],
    claims: [normalizeClaim({ statement: "Sonic Alchemy is viable", subject: "n1", confidence: 0.8 }, { id: "c1" })],
    tensions: [{ kind: "contested_evidence", subject: "n1", claimIds: ["c1"], why: "sources disagree" }],
    now: NOW,
  });
  const keys = lens.sections.map((s) => s.key);
  ok("new evidence section", keys.includes("new"));
  ok("counterevidence section", keys.includes("counter"));
  ok("corrections section", keys.includes("corrections"));
  ok("claims section", keys.includes("claims"));
  ok("tensions section with notes", lens.sections.find((s) => s.key === "tensions")?.notes?.[0] === "sources disagree");
  ok("unrelated evidence filtered out", lens.counts.evidence === 3);
  ok("new section excludes the unrelated item", (lens.sections.find((s) => s.key === "new")?.evidence || []).every((e) => !/cooking/i.test(e.title)));
}

// 3. "Worth turning into claims" from claim_candidates not already a claim.
{
  const lens = worldLens({
    subject: "t", subjectTitle: "Quantum Sensing", claims: [], tensions: [],
    evidence: [ev({ title: "Quantum Sensing advances", summary: "quantum sensing magnetometer", status: "new", claim_candidates: ["New magnetometer hits record sensitivity"] }, 1)],
    now: NOW,
  });
  const q = lens.sections.find((s) => s.key === "questions");
  ok("open questions surfaced from claim candidates", !!q && q.notes!.some((n) => /magnetometer/i.test(n)));
}

// 4. Empty subject → empty lens (no false relevance).
{
  const lens = worldLens({ subject: "x", subjectTitle: "", claims: [], tensions: [], evidence: [ev({ title: "anything", summary: "stuff", status: "new" }, 1)], now: NOW });
  ok("no subject terms → nothing relevant", lens.counts.evidence === 0 && lens.sections.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
