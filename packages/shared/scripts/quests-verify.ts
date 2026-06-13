// Living OS (Wave G3) Quest / Action stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/quests-verify.ts
// Run from the repo root.

import {
  QUEST_KINDS, QUEST_STATES, isInPlay, canApply, applyAction, questBucket,
  inferKind, questFromBriefAction, questFromNode, questFromTimeMachine, questFromCompanion,
  suggestQuests, QUEST_KIND_STYLE, QUEST_STATE_STYLE,
} from "../src/quests";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// kinds + states
ok("four quest kinds", QUEST_KINDS.join() === "main,side,research,maintenance");
ok("six quest states", QUEST_STATES.join() === "suggested,accepted,active,blocked,completed,archived");
ok("isInPlay = accepted|active", isInPlay("accepted") && isInPlay("active") && !isInPlay("suggested") && !isInPlay("completed"));

// state machine
ok("suggested→accept→accepted", applyAction("suggested", "accept") === "accepted");
ok("accepted→start→active", applyAction("accepted", "start") === "active");
ok("active→complete→completed", applyAction("active", "complete") === "completed");
ok("active→block→blocked", applyAction("active", "block") === "blocked");
ok("blocked→unblock→active", applyAction("blocked", "unblock") === "active");
ok("any→archive→archived", applyAction("blocked", "archive") === "archived");
ok("illegal: suggested cannot complete", applyAction("suggested", "complete") === null);
ok("illegal: completed cannot start", applyAction("completed", "start") === null);
ok("canApply mirrors applyAction", canApply("suggested", "accept") && !canApply("suggested", "start"));

// kind inference
ok("research keyword → research", inferKind("Research the new DSP technique") === "research");
ok("review keyword → maintenance", inferKind("Review and prune stale nodes") === "maintenance");
ok("ship keyword → main", inferKind("Ship the flagship release") === "main");
ok("plain text → side", inferKind("Email the collaborator") === "side");

// suggestion builders
const bq = questFromBriefAction({ text: "Ship Quartz beta", priority: "high" }, "brief_1");
ok("high-priority brief action → main quest", bq.kind === "main" && bq.source_type === "brief" && bq.source_id === "brief_1");
const nq = questFromNode({ id: "n1", title: "Quartz", summary: "flagship" }, "Revisit");
ok("node quest anchors node_id (for Atlas badge)", nq.node_id === "n1" && nq.source_type === "node");
const tq = questFromTimeMachine({ title: "Revisit: old idea", node_id: "n9", reason: "resurfaced" });
ok("time-machine quest carries reason + node", tq.source_type === "time_machine" && tq.node_id === "n9");
const cq = questFromCompanion({ node_id: "n2", verb: "research", title: "Modulation" });
ok("companion research → research quest", cq.kind === "research" && cq.source_type === "companion");

// bulk suggest from MANY real signals + de-dupe
const seeds = suggestQuests({
  inboxCount: 4,
  reviewCount: 2,
  recommendedFocus: [{ text: "Ship Quartz", priority: "high" }, { text: "Ship Quartz", priority: "high" }],
  topNodes: [{ id: "n1", title: "Quartz", mvs: 92 }, { id: "n2", title: "Mid node", mvs: 40 }],
  forgottenGems: [{ id: "g1", title: "Forgotten gem" }],
  resurfacedThemes: ["audio"],
  activeProjects: [{ id: "p1", name: "Audio Tools" }],
  blockedNodes: [{ id: "b1", title: "Blocked thing" }],
  hasDecisions: true, hasContextPacks: true,
});
ok("suggest de-dupes by title", seeds.filter((s) => s.title === questFromBriefAction({ text: "Ship Quartz", priority: "high" }, "x").title).length === 1);
ok("suggest emits an inbox-triage quest", seeds.some((s) => s.source_type === "inbox"));
ok("suggest emits a review-queue quest", seeds.some((s) => s.source_type === "review"));
ok("suggest advances high-MVS node, skips low one", seeds.some((s) => s.source_type === "node" && s.node_id === "n1") && !seeds.some((s) => s.node_id === "n2"));
ok("suggest pushes active projects", seeds.some((s) => s.source_type === "project" && s.source_id === "p1"));
ok("suggest uses resurfaced themes", seeds.some((s) => s.source_type === "time_machine" && /audio/.test(s.title)));

// sparse vault → safe onboarding fallback (never empty)
const onboarding = suggestQuests({ inboxCount: 0, topNodes: [], activeProjects: [] });
ok("empty vault yields onboarding quests", onboarding.length >= 5, JSON.stringify(onboarding.map((s) => s.title)));
ok("onboarding includes Triage + decision + context pack + time machine", ["Triage", "decision", "context pack", "Time Machine"].every((kw) => onboarding.some((s) => new RegExp(kw, "i").test(s.title))));
ok("unused journal/packs → first-decision + first-context-pack nudges", (() => { const s = suggestQuests({ inboxCount: 1, hasDecisions: false, hasContextPacks: false }); return s.some((x) => /first decision/i.test(x.title)) && s.some((x) => /first context pack/i.test(x.title)); })());

// UI bucketing — every quest lands in exactly one Mission Control section
const FUTURE = new Date(Date.now() + 3600000).toISOString();
const PAST = new Date(Date.now() - 3600000).toISOString();
ok("suggested → Suggested", questBucket({ state: "suggested" }) === "suggested");
ok("accept (active) → Active Today", questBucket({ state: "active" }) === "active");
ok("accepted also → Active Today", questBucket({ state: "accepted" }) === "active");
ok("future snooze → Snoozed (overrides state)", questBucket({ state: "active", snooze_until: FUTURE }) === "snoozed");
ok("past snooze → no longer snoozed", questBucket({ state: "active", snooze_until: PAST }) === "active");
ok("project_id → Converted to Project", questBucket({ state: "active", project_id: "proj_1" }) === "converted");
ok("completed → Completed (beats converted)", questBucket({ state: "completed", project_id: "proj_1" }) === "completed");
ok("blocked → Blocked", questBucket({ state: "blocked" }) === "blocked");
ok("archived → hidden (null)", questBucket({ state: "archived" }) === null);

// styles cover every kind/state
ok("every kind has a style", QUEST_KINDS.every((k) => !!QUEST_KIND_STYLE[k].label));
ok("every state has a style", QUEST_STATES.every((s) => !!QUEST_STATE_STYLE[s].label));

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
