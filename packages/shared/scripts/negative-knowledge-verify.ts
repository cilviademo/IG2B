// Negative knowledge — pure.  npx tsx packages/shared/scripts/negative-knowledge-verify.ts
import { NEGATIVE_KINDS, isNegativeKind, negativeKindLabel, normalizeNegativeKind, normalizeNegative } from "../src/negative-knowledge";
import { worldLens } from "../src/world-lens";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

ok("three kinds", NEGATIVE_KINDS.join() === "not_found,retracted,excluded");
ok("isNegativeKind validates", isNegativeKind("retracted") && !isNegativeKind("nope"));
ok("kind labels human", negativeKindLabel("not_found") === "Searched, nothing found" && negativeKindLabel("excluded") === "Deliberately excluded");
ok("normalizeNegativeKind defaults to excluded", normalizeNegativeKind("garbage") === "excluded" && normalizeNegativeKind(undefined) === "excluded");
ok("normalizeNegativeKind keeps valid", normalizeNegativeKind("retracted") === "retracted");

{
  const r = normalizeNegative({ subject: "  superconductors", kind: "not_found", note: "No room-temp result replicated" }, { id: "ng1" });
  ok("subject + note carried", r.subject === "  superconductors".slice(0, 200) && r.note === "No room-temp result replicated");
  ok("kind validated", r.kind === "not_found");
  ok("bad kind → excluded default", normalizeNegative({ subject: "x", kind: "weird" }, { id: "ng2" }).kind === "excluded");
  ok("missing fields safe", normalizeNegative({}, { id: "ng3" }).subject === "" && normalizeNegative({}, { id: "ng3" }).note === "");
  ok("note clamped to 600", normalizeNegative({ note: "z".repeat(900) }, { id: "ng4" }).note.length === 600);
}

// World Lens surfaces a "Known gaps & exclusions" section when negatives are present.
{
  const lens = worldLens({
    subject: "s", subjectTitle: "Room temperature superconductors", claims: [], evidence: [], tensions: [],
    negatives: [{ kind: "retracted", note: "LK-99 claim retracted" }, { kind: "not_found", note: "No replications found" }],
  });
  const gaps = lens.sections.find((s) => s.key === "gaps");
  ok("gaps section present with notes", !!gaps && gaps.notes!.length === 2);
  ok("gap notes tagged by kind", !!gaps && gaps.notes!.some((n) => n.startsWith("[retracted]")));
  ok("no negatives → no gaps section", !worldLens({ subject: "s", subjectTitle: "x", claims: [], evidence: [], tensions: [] }).sections.some((s) => s.key === "gaps"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
