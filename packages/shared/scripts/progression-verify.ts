// Living OS (Wave G4) Progression stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/progression-verify.ts
// Run from the repo root.

import {
  TRACKS, inferTracks, questXp, captureXp, LEVELS, levelFor, computeTracks,
  momentumFor, MOMENTUM_STYLE, progressionSummary, questReward, trackLabel,
} from "../src/progression";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// tracks + inference
ok("eight tracks", TRACKS.length === 8 && TRACKS.map((t) => t.key).includes("ai_systems"));
ok("infer AI track", inferTracks("Build an LLM agent with RAG").includes("ai_systems"));
ok("infer music track", inferTracks("DSP audio modulation plugin").includes("music"));
ok("infer business track", inferTracks("Multibanded revenue ops").includes("business"));
ok("infer caps at 2 tracks", inferTracks("ai llm music audio business revenue build code design art").length <= 2);
ok("unmatched defaults to learning", inferTracks("zzz qqq").join() === "learning");

// xp rules
ok("main quest = 25 XP", questXp("main") === 25);
ok("maintenance = 10 XP", questXp("maintenance") === 10);
ok("capture base = 3 XP at mvs 0", captureXp(0) === 3);
ok("high-mvs capture grants more", captureXp(100) > captureXp(20) && captureXp(100) === 8);

// levels
ok("six levels Dormant..Core Identity", LEVELS.length === 6 && LEVELS[5].name === "Core Identity");
ok("0 XP = Dormant L0", levelFor(0).level === 0 && levelFor(0).name === "Dormant");
ok("1 XP = Initiated L1", levelFor(1).level === 1);
ok("160 XP = Compounding L3", levelFor(160).level === 3 && levelFor(160).name === "Compounding");
ok("level progress in [0,1]", (() => { const l = levelFor(100); return l.progress >= 0 && l.progress <= 1; })());
ok("toNext counts down", levelFor(60).toNext === 150 - 60);
ok("max level has no next", levelFor(999).next === null && levelFor(999).progress === 1);

// computeTracks (deterministic + explainable)
const tracks = computeTracks({
  completedQuests: [{ kind: "main", title: "Ship the LLM agent" }, { kind: "maintenance", title: "Review research notes" }],
  nodes: [{ mvs: 90, title: "DSP audio engine", tags: ["audio"] }],
});
ok("AI track got main quest XP (25)", tracks.ai_systems.xp >= 25 && tracks.ai_systems.fromQuests >= 25);
ok("music track got capture XP", tracks.music.xp >= captureXp(90) && tracks.music.fromCaptures > 0);
ok("track carries a level object", typeof tracks.ai_systems.level.level === "number");

// momentum
ok("blocked wins", momentumFor({ recentNodes: 5, activeQuests: 2, completedQuests: 3, blocked: true, inactivityDays: 0, hasHistory: true }) === "blocked");
ok("no history = dormant", momentumFor({ recentNodes: 0, activeQuests: 0, completedQuests: 0, blocked: false, inactivityDays: 0, hasHistory: false }) === "dormant");
ok("stale = at_risk then dormant", momentumFor({ recentNodes: 0, activeQuests: 0, completedQuests: 0, blocked: false, inactivityDays: 25, hasHistory: true }) === "at_risk" && momentumFor({ recentNodes: 0, activeQuests: 0, completedQuests: 0, blocked: false, inactivityDays: 60, hasHistory: true }) === "dormant");
ok("2 done + recent = compounding", momentumFor({ recentNodes: 1, activeQuests: 0, completedQuests: 2, blocked: false, inactivityDays: 1, hasHistory: true }) === "compounding");
ok("active quest + recent = accelerating", momentumFor({ recentNodes: 1, activeQuests: 1, completedQuests: 0, blocked: false, inactivityDays: 1, hasHistory: true }) === "accelerating");
ok("every momentum has a style", (["dormant", "warming", "active", "accelerating", "blocked", "at_risk", "compounding"] as const).every((m) => !!MOMENTUM_STYLE[m].label));

// summary + bootstrap
const sparse = progressionSummary({ tracks: computeTracks({}), todayXp: 0, totalSignals: 1 });
ok("sparse vault -> bootstrap copy", sparse.bootstrap && /more accurate as quests/i.test(sparse.narrative));
const rich = progressionSummary({ tracks, todayXp: 25, todayByTrack: { ai_systems: 25 }, totalSignals: 9, todayCaptures: 1, todayQuests: 1 });
ok("rich vault -> gaining track named", !rich.bootstrap && rich.gaining?.track === "ai_systems" && /momentum today/i.test(rich.narrative));
ok("summary has a recommendation", rich.recommendation.length > 0);

// quest reward preview
const r = questReward({ kind: "main", title: "Ship the LLM agent", project_name: "BTZ TRACE" });
ok("reward = 25 XP to AI Systems", r.xp === 25 && r.tracks.includes("ai_systems"));
ok("reward 'why' mentions project + XP", /\+25/.test(r.why) && /BTZ TRACE/.test(r.why));
ok("trackLabel resolves", trackLabel("music") === "Music Production");

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
