// Living OS (Wave G5) Boardroom stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/boardroom-verify.ts
// Run from the repo root.

import { PERSONAS, boardroom } from "../src/boardroom";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

ok("six personas", PERSONAS.length === 6 && PERSONAS.map((p) => p.key).join() === "strategist,skeptic,operator,creative,historian,teacher");

// A rich subject → all six speak + a resolved action with a deadline.
const s = boardroom(
  { title: "BTZ TRACE", summary: "Flagship DSP spectral analyzer", mvs: 92, tags: ["dsp", "audio"], type: "project" },
  { degree: 5, recentEdges: 2, inboundBlocked: false, recencyDays: 3, related: ["FLOW", "Sonic Alchemy"], momentum: "accelerating", calibrationNote: "well-calibrated" },
);
ok("all six personas produce a line", s.lines.length === 6 && s.lines.every((l) => l.line.length > 0));
ok("strategist sees high leverage", /high leverage/i.test(s.lines[0].line));
ok("skeptic flags CPU/realtime risk for DSP", /CPU|real-time|complexity/i.test(s.lines[1].line));
ok("operator proposes analyzer/prototype first", /analyzer|prototype/i.test(s.lines[2].line));
ok("creative combines with a related node", /FLOW|Sonic Alchemy/.test(s.lines[3].line));
ok("historian uses the calibration note", /well-calibrated/i.test(s.lines[4].line));
ok("teacher explains + a learning step", /plain terms/i.test(s.lines[5].line));
ok("resolved has an action + a date", /Resolved:/.test(s.resolved) && /\d{4}-\d{2}-\d{2}/.test(s.resolved));
ok("resolvedAction is non-empty (for a quest)", s.resolvedAction.length > 0 && !s.bootstrap);

// Blocked + stale subject → skeptic gates the resolution.
const r = boardroom(
  { title: "Old idea", summary: "stalled", mvs: 30, tags: [], type: "concept" },
  { degree: 7, inboundBlocked: true, recencyDays: 60, related: [] },
);
ok("skeptic lists multiple risks", (r.lines[1].line.match(/;/g) || []).length >= 1);
ok("resolution is gated when risk is high", /gated on resolving/i.test(r.resolved));
ok("historian notes long dormancy", /dormant|resurfaced/i.test(r.lines[4].line));

// Sparse subject → bootstrap copy, no fabricated confidence.
const b = boardroom({ title: "x", type: "concept" }, {});
ok("sparse subject → bootstrap resolution", b.bootstrap && /capture more/i.test(b.resolved));

// Deadlines are always in the future (a Friday).
ok("deadline is a future Friday", (() => { const m = s.resolved.match(/(\d{4}-\d{2}-\d{2})/); if (!m) return false; const d = new Date(m[1] + "T00:00:00Z"); return d.getUTCDay() === 5 && d.getTime() > Date.now(); })());

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
