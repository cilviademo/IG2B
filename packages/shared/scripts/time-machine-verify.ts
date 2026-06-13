// Living OS (Wave G2) Time Machine stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/time-machine-verify.ts
// Run from the repo root.

import {
  windowFor, priorWindow, memoryReplay, changeDetection, decisionReflection, resurfaced,
  timeMachine, RANGES, type TimeMachineInput,
} from "../src/time-machine";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const NOW = new Date("2026-06-13T00:00:00Z").getTime();
const dISO = (daysAgo: number) => new Date(NOW - daysAgo * 86400000).toISOString();

const input: TimeMachineInput = {
  nodes: [
    { id: "a", title: "Active recent", mvs: 80, tags: ["dsp", "audio"], created_at: dISO(60), updated_at: dISO(5) },
    { id: "b", title: "Forgotten gem", mvs: 90, tags: ["audio"], created_at: dISO(200), updated_at: dISO(120) },
    { id: "c", title: "Emerging new", mvs: 50, tags: ["new-theme"], created_at: dISO(3), updated_at: dISO(3) },
    { id: "d", title: "Old + resurfaced", mvs: 65, tags: ["revival"], created_at: dISO(300), updated_at: dISO(4) },
  ],
  edges: [
    { source_id: "a", target_id: "b", relationship: "relates_to", valid_from: dISO(6) },
    { source_id: "a", target_id: "c", relationship: "contradicts", valid_from: dISO(2) },
  ],
  timeline: [
    { id: "t1", date: dISO(10).slice(0, 10), type: "insight", significance: "high", title: "Recent insight" },
    { id: "t2", date: dISO(200).slice(0, 10), type: "project", significance: "low", title: "Old event" },
  ],
  decisions: [
    { id: "d1", decision: "Ship feature X", confidence: 0.9, expected_outcome: "adoption", outcome: "flopped", outcome_success: false, status: "reviewed", review_by: dISO(5).slice(0, 10) },
    { id: "d2", decision: "Skip rewrite", confidence: 0.3, expected_outcome: "fine", outcome: "fine", outcome_success: true, status: "reviewed" },
    { id: "d3", decision: "Open question", confidence: 0.5, status: "open", review_by: dISO(2).slice(0, 10) },
  ],
};

// windows
const w30 = windowFor("30d", NOW);
ok("windowFor(30d) spans 30 days", w30.days === 30);
ok("priorWindow sits immediately before", priorWindow(w30).toISO === w30.fromISO);
ok("RANGES covers week..year", RANGES.map((r) => r.key).join() === "7d,30d,90d,180d,365d");

// replay
const replay = memoryReplay(input, w30);
ok("replay includes recent + new + resurfaced nodes (3)", replay.counts.nodes === 3, JSON.stringify(replay.counts));
ok("replay top node is the highest-mvs active one", replay.topNodes[0]?.id === "a", JSON.stringify(replay.topNodes));
ok("replay surfaces in-window timeline highlight", replay.highlights.some((h) => h.id === "t1") && !replay.highlights.some((h) => h.id === "t2"));
ok("replay aggregates themes", replay.themes.some((t) => t.tag === "audio"));

// change detection
const ch = changeDetection(input, NOW, w30);
ok("new theme detected", ch.newThemes.includes("new-theme"), JSON.stringify(ch.newThemes));
ok("contradiction edge surfaced", ch.contradictions.some((c) => c.relationship === "contradicts"));
ok("strengthened includes high-mvs recent node", ch.strengthenedProjects.some((p) => p.id === "a"));
ok("missed follow-up = overdue open decision", ch.missedFollowups.some((m) => m.id === "d3"));

// reflection / calibration
const refl = decisionReflection(input.decisions);
ok("reflection counts resolved decisions", refl.resolved === 2, JSON.stringify({ resolved: refl.resolved }));
ok("reflection counts hits + misses", refl.hits === 1 && refl.misses === 1);
ok("overconfident decision yields a blind-spot lesson", refl.lessons.some((l) => !l.success && l.confidence > 0.6 && /blind spot/i.test(l.lesson)));
ok("empty journal is handled", decisionReflection([]).calibration.note.length > 0);

// resurfaced
const res = resurfaced(input, NOW, w30);
ok("forgotten gem detected (high mvs, dormant)", res.forgottenGems.some((g) => g.id === "b"), JSON.stringify(res.forgottenGems));

// full report
const full = timeMachine(input, "30d", NOW);
ok("timeMachine assembles all four sections", !!(full.replay && full.changes && full.reflection && full.resurfaced));
ok("custom range honors days", windowFor("custom", NOW, 14).days === 14);

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
