// Living OS (Wave G9) Mentor Mode stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/mentor-verify.ts
// Run from the repo root.

import { MENTOR_QUESTIONS, mentor } from "../src/mentor";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

ok("five mentor questions", MENTOR_QUESTIONS.length === 5 && MENTOR_QUESTIONS.map((q) => q.intent).join() === "then,changed,wrong,advice,best_self");

const rich = {
  windowLabel: "last quarter",
  topNodes: [{ title: "BTZ TRACE", mvs: 92 }, { title: "Sonic Alchemy", mvs: 74 }],
  themes: ["dsp", "audio"],
  newThemes: ["spectral"], decayedThemes: ["legacy ui"], resurfacedThemes: ["modulation"],
  decisions: [
    { decision: "Ship analyzer beta", confidence: 0.9, success: false, outcome: "delayed" },
    { decision: "Skip rewrite", confidence: 0.3, success: true, outcome: "fine" },
  ],
  calibrationNote: "Overconfident by 20 pts.",
  activeFocus: [{ title: "BTZ TRACE", mvs: 92 }, { title: "Business systems", mvs: 68 }],
  constraints: { weekly_hours: 12, risk_tolerance: "medium" },
};

// then
const then = mentor("then", rich);
ok("then → Past you voice, names top focus", then.voice === "Past you" && /BTZ TRACE/.test(then.answer) && !then.bootstrap);
ok("then → points cite MVS", then.points.some((p) => /MVS 92/.test(p)));

// changed
const changed = mentor("changed", rich);
ok("changed → reports new/faded/resurfaced", /spectral/.test(changed.answer) && /legacy ui/.test(changed.answer) && /modulation/.test(changed.answer));

// wrong — uses real resolved decisions + calibration
const wrong = mentor("wrong", rich);
ok("wrong → counts the miss + flags overconfidence", /wrong on 1 of 2/i.test(wrong.answer) && /confident/i.test(wrong.answer));
ok("wrong → cites the overconfident decision", wrong.points.some((p) => /Ship analyzer beta/.test(p)) && !!wrong.suggestion);

// advice — tendency from calibration
const advice = mentor("advice", rich);
ok("advice → Past you, overconfidence tendency", advice.voice === "Past you" && /overrate your certainty/i.test(advice.answer));

// best_self — from active focus + constraints
const best = mentor("best_self", rich);
ok("best_self → Your best self voice, protects top focus + hours", best.voice === "Your best self" && /BTZ TRACE/.test(best.answer) && /12 weekly hours/.test(best.answer));

// bootstrap — empty history
const emptyThen = mentor("then", {});
ok("empty 'then' → bootstrap copy", emptyThen.bootstrap && /enough history/i.test(emptyThen.answer));
const emptyWrong = mentor("wrong", { decisions: [] });
ok("no resolved decisions → honest 'log outcomes'", emptyWrong.bootstrap && /log outcomes/i.test(emptyWrong.answer));
const noMiss = mentor("wrong", { decisions: [{ decision: "X", confidence: 0.7, success: true }] });
ok("all-correct sample → warns about small sample, not bootstrap", !noMiss.bootstrap && /small sample/i.test(noMiss.answer));

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
