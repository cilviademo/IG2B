// Living OS (Wave G5) Boardroom stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/boardroom-verify.ts
// Run from the repo root.

import { PERSONAS, boardroom, boardroomPrompt, mergeBoardroomModel } from "../src/boardroom";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

ok("classic six personas (default council)", PERSONAS.filter((p) => !p.extended).map((p) => p.key).join() === "strategist,skeptic,operator,creative,historian,teacher");
ok("five extended personas (opt-in)", PERSONAS.filter((p) => p.extended).map((p) => p.key).join() === "security_auditor,reality_checker,synthesizer,architect,pm");
ok("no duplicate persona keys", new Set(PERSONAS.map((p) => p.key)).size === PERSONAS.length);

// Extended council is opt-in + deterministic (works with no key).
{
  const def = boardroom({ title: "Thing", type: "concept" }, { degree: 2 });
  ok("default council stays 6 lines", def.lines.length === 6);
  const ext = boardroom({ title: "Thing", type: "concept" }, { degree: 2 }, { extended: true });
  ok("extended council = 11 lines", ext.lines.length === 11);
  ok("extended adds the new lenses", ["security_auditor", "reality_checker", "synthesizer", "architect", "pm"].every((k) => ext.lines.some((l) => l.persona === k)));
  ok("every extended line is non-empty", ext.lines.every((l) => l.line.length > 10));
  // Security auditor reacts to sensitive content deterministically.
  const sens = boardroom({ title: "Bank password vault", tags: ["financial"], type: "note" }, {}, { extended: true });
  ok("security auditor flags sensitive subject", /vault-only|never send/i.test(sens.lines.find((l) => l.persona === "security_auditor")!.line));
  const plain = boardroom({ title: "Sourdough recipe", type: "note" }, {}, { extended: true });
  ok("security auditor calm on non-sensitive", /no obvious exposure/i.test(plain.lines.find((l) => l.persona === "security_auditor")!.line));
  // Determinism: same input → same lines.
  const a = boardroom({ title: "X", type: "concept" }, { degree: 3 }, { extended: true });
  const b2 = boardroom({ title: "X", type: "concept" }, { degree: 3 }, { extended: true });
  ok("extended council is deterministic", JSON.stringify(a.lines) === JSON.stringify(b2.lines));
}

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

// Live upgrade — boardroomPrompt + mergeBoardroomModel (deterministic floor stays the fallback).
{
  const subj = { title: "BTZ Sonic Alchemy", summary: "A spectral audio plugin", type: "project", tags: ["dsp"], mvs: 70 };
  const { system, prompt } = boardroomPrompt(subj, { degree: 3, related: ["Reverb engine"], question: "Ship it?" });
  ok("prompt asks for JSON with persona keys", /JSON/.test(system) && /strategist/.test(system));
  ok("prompt fences the subject as untrusted", /⟦UNTRUSTED:SUBJECT⟧/.test(prompt) && prompt.includes("Sonic Alchemy"));
  ok("prompt includes the guard + honesty instruction", /UNTRUSTED/.test(system) && /sparse|malformed|invent/i.test(system));
  ok("extended roster includes the 5 lenses", /security_auditor/.test(boardroomPrompt(subj, {}, { extended: true }).system));

  const floor = boardroom(subj, { degree: 3 });
  const good = JSON.stringify({ lines: [{ persona: "strategist", line: "Real model take on Sonic Alchemy." }, { persona: "skeptic", line: "Real risk." }], resolved: "Ship a v0.1.", resolvedAction: "Cut scope to the analyzer." });
  const merged = mergeBoardroomModel(floor, good);
  ok("merge replaces a persona's line with model output", merged.ok && merged.synthesis.lines.find((l) => l.persona === "strategist")!.line === "Real model take on Sonic Alchemy.");
  ok("merge keeps persona identity/role/color", merged.synthesis.lines.find((l) => l.persona === "strategist")!.name === "Strategist");
  ok("merge overrides resolved/resolvedAction", merged.synthesis.resolved === "Ship a v0.1." && merged.synthesis.resolvedAction === "Cut scope to the analyzer.");
  ok("unmatched personas keep the floor line", merged.synthesis.lines.find((l) => l.persona === "operator")!.line === floor.lines.find((l) => l.persona === "operator")!.line);
  ok("garbage JSON → floor (ok=false)", mergeBoardroomModel(floor, "not json").ok === false && mergeBoardroomModel(floor, "not json").synthesis === floor);
  ok("empty lines → floor (no silent blanking)", mergeBoardroomModel(floor, JSON.stringify({ lines: [{ persona: "strategist", line: "  " }] })).ok === false);
  ok("no matching personas → floor", mergeBoardroomModel(floor, JSON.stringify({ lines: [{ persona: "nobody", line: "x" }] })).ok === false);
}

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
