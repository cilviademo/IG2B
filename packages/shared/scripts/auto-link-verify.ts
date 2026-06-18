// Auto-linking selector — pure.  npx tsx packages/shared/scripts/auto-link-verify.ts
import { selectAutoLinks } from "../src/auto-link";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const s = (id: string, score: number) => ({ subject_id: id, score });

ok("keeps only >= threshold (default 0.7)", JSON.stringify(selectAutoLinks([s("a", 0.9), s("b", 0.5)]).map((l) => l.target_id)) === JSON.stringify(["a"]));
ok("caps at k", selectAutoLinks([s("a", 0.95), s("b", 0.9), s("c", 0.85), s("d", 0.8)], { k: 2 }).length === 2);
ok("skips already-linked targets", selectAutoLinks([s("a", 0.9), s("b", 0.9)], { existingTargetIds: new Set(["a"]) }).map((l) => l.target_id).join() === "b");
ok("skips duplicate ids in input", selectAutoLinks([s("a", 0.9), s("a", 0.88)]).length === 1);
ok("weight clamped 0..1 + rounded", (() => { const w = selectAutoLinks([s("a", 1.4)])[0]?.weight; return w === 1; })());
ok("custom threshold honored", selectAutoLinks([s("a", 0.65)], { threshold: 0.6 }).length === 1 && selectAutoLinks([s("a", 0.65)]).length === 0);
ok("empty input → no links", selectAutoLinks([]).length === 0);
ok("k=0 → no links", selectAutoLinks([s("a", 0.99)], { k: 0 }).length === 0);
ok("missing id ignored", selectAutoLinks([{ subject_id: "", score: 0.9 } as { subject_id: string; score: number }, s("b", 0.9)]).map((l) => l.target_id).join() === "b");
ok("non-numeric score ignored", selectAutoLinks([{ subject_id: "a", score: NaN }, s("b", 0.9)]).map((l) => l.target_id).join() === "b");
ok("order preserved (already ranked)", selectAutoLinks([s("a", 0.9), s("b", 0.95)]).map((l) => l.target_id).join() === "a,b");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
