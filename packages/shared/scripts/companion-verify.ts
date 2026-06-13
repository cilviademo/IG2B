// Living OS (Wave G10) Companion stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/companion-verify.ts
// Run from the repo root.

import { timeGreeting, morningBriefing } from "../src/companion";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const AM = new Date("2026-06-13T08:00:00").getTime();
const PM = new Date("2026-06-13T15:00:00").getTime();
const EVE = new Date("2026-06-13T20:00:00").getTime();
ok("time greeting by hour", timeGreeting(AM) === "Good morning" && timeGreeting(PM) === "Good afternoon" && timeGreeting(EVE) === "Good evening");

const b = morningBriefing({
  now: AM,
  acceleratedProjects: ["BTZ TRACE", "Sonic Alchemy", "Business systems"],
  topMomentum: "BTZ TRACE",
  resurfaced: ["modulation"],
  criticalQuests: 2,
  activeQuests: 5,
  recommendedFocus: ["Finish analyzer prototype", "Archive inactive nodes", "Research spectral DSP"],
  todayXp: 40, streak: 3,
});
ok("greeting present", b.greeting === "Good morning" && !b.bootstrap);
ok("reports accelerated projects", b.lines.some((l) => /3 projects accelerated/.test(l)));
ok("names top momentum", b.lines.some((l) => /BTZ TRACE gained momentum/.test(l)));
ok("reports resurfaced", b.lines.some((l) => /modulation resurfaced/i.test(l)));
ok("reports critical quests", b.lines.some((l) => /2 critical quests/.test(l)));
ok("streak surfaced", b.lines.some((l) => /3-day streak/.test(l)));
ok("focus capped at 3", b.focus.length === 3);
ok("speech is one spoken string with greeting + focus", /^Good morning\./.test(b.speech) && /Recommended focus: 1\. Finish analyzer prototype\./.test(b.speech));
ok("speech mentions XP today", /40 XP earned today/.test(b.speech));

// singular grammar
const one = morningBriefing({ now: AM, acceleratedProjects: ["X"], criticalQuests: 1, recommendedFocus: ["do thing"] });
ok("singular 'project'/'quest'", /1 project accelerated/.test(one.lines.join(" ")) && /1 critical quest\b/.test(one.lines.join(" ")));

// bootstrap — nothing to say
const empty = morningBriefing({ now: AM });
ok("empty → bootstrap speech", empty.bootstrap && /Quiet start/i.test(empty.speech) && empty.lines.length === 0);

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
