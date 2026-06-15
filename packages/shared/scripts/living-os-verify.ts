// Living OS (Wave G1) stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/living-os-verify.ts
// Run from the repo root.

import {
  VERBS, verbsFor, findVerb, computeNodeState, NODE_STATE_STYLE, NODE_STATES,
  isForgottenGem, isResurfaced, memoryTier, isCrystallized, MEMORY_TIER_PATINA,
  type NodeState,
} from "../src/living-os";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// ---- Companion Panel verb router ----
ok("every verb maps to an existing job or sync action", VERBS.every((v) =>
  (v.fulfilment.kind === "job" && ["ask", "assist", "research", "simulation", "context_pack"].includes(v.fulfilment.job)) ||
  (v.fulfilment.kind === "sync" && v.fulfilment.action === "create_task")));
ok("verbsFor(brief) excludes node-only verbs", !verbsFor("brief").some((v) => v.verb === "next_steps" || v.verb === "research" || v.verb === "simulate"));
ok("verbsFor(node) includes simulate + context_pack", verbsFor("node").some((v) => v.verb === "simulate") && verbsFor("node").some((v) => v.verb === "context_pack"));
ok("verbsFor(capture) excludes simulate/context_pack", !verbsFor("capture").some((v) => v.verb === "simulate" || v.verb === "context_pack"));
ok("create_task is the only sync verb", VERBS.filter((v) => v.fulfilment.kind === "sync").map((v) => v.verb).join() === "create_task");
ok("findVerb resolves explain -> ask job", findVerb("explain")?.fulfilment.kind === "job" && (findVerb("explain")!.fulfilment as { job: string }).job === "ask");
ok("findVerb on unknown verb is undefined", findVerb("teleport") === undefined);

// ---- Node states (priority order + thresholds) ----
ok("critical wins over everything", computeNodeState({ mvs: 90, recencyDays: 1, inboundBlocked: true, recentEdges: 5, degree: 5, createdDays: 1, critical: true }) === "critical");
ok("blocked wins over growing", computeNodeState({ mvs: 90, recencyDays: 1, inboundBlocked: true, recentEdges: 5, degree: 5, createdDays: 30 }) === "blocked");
ok("growing = recent + momentum + value", computeNodeState({ mvs: 70, recencyDays: 3, inboundBlocked: false, recentEdges: 2, degree: 4, createdDays: 60 }) === "growing");
ok("emerging = young + low degree", computeNodeState({ mvs: 30, recencyDays: 2, inboundBlocked: false, recentEdges: 0, degree: 1, createdDays: 3 }) === "emerging");
ok("dormant = stale + low value", computeNodeState({ mvs: 20, recencyDays: 90, inboundBlocked: false, recentEdges: 0, degree: 3, createdDays: 200 }) === "dormant");
ok("decaying = aging + mid value", computeNodeState({ mvs: 50, recencyDays: 30, inboundBlocked: false, recentEdges: 0, degree: 3, createdDays: 200 }) === "decaying");
ok("stable is the fallback", computeNodeState({ mvs: 80, recencyDays: 18, inboundBlocked: false, recentEdges: 0, degree: 8, createdDays: 200 }) === "stable");

// ---- Visual contract ----
ok("legendary = very high value + richly connected", computeNodeState({ mvs: 92, recencyDays: 5, inboundBlocked: false, recentEdges: 1, degree: 6, createdDays: 120 }) === "legendary");
ok("blocked still outranks legendary", computeNodeState({ mvs: 92, recencyDays: 5, inboundBlocked: true, recentEdges: 1, degree: 6, createdDays: 120 }) === "blocked");
ok("legendary/growing/critical pulse", NODE_STATES.filter((s) => NODE_STATE_STYLE[s].pulse).sort().join() === ["critical", "growing", "legendary"].sort().join());
ok("legendary carries a ★ badge", NODE_STATE_STYLE.legendary.badge === "★");
ok("every state has a style + label", NODE_STATES.every((s: NodeState) => !!NODE_STATE_STYLE[s].label));
// G8 overlays
ok("forgotten gem = high value, gone quiet", isForgottenGem(80, 60) && !isForgottenGem(80, 10) && !isForgottenGem(40, 60));
ok("resurfaced = old idea freshly touched", isResurfaced(120, 5) && !isResurfaced(120, 30) && !isResurfaced(10, 5));
ok("dim is in [0,1]", NODE_STATES.every((s) => NODE_STATE_STYLE[s].dim >= 0 && NODE_STATE_STYLE[s].dim <= 1));
ok("blocked + critical carry a badge", !!NODE_STATE_STYLE.blocked.badge && !!NODE_STATE_STYLE.critical.badge);

// ---- Sprint 6: memory-age evolution (overlay, must not perturb the state machine) ----
ok("memoryTier bands by age", memoryTier(3) === "fresh" && memoryTier(30) === "forming" && memoryTier(120) === "established" && memoryTier(400) === "enduring");
ok("crystallized = enduring + valuable + connected", isCrystallized({ createdDays: 200, mvs: 75, degree: 4 }) && !isCrystallized({ createdDays: 200, mvs: 60, degree: 4 }) && !isCrystallized({ createdDays: 100, mvs: 90, degree: 9 }));
ok("only mature tiers get a patina", !MEMORY_TIER_PATINA.fresh && !MEMORY_TIER_PATINA.forming && !!MEMORY_TIER_PATINA.established && !!MEMORY_TIER_PATINA.enduring);
ok("memory overlay leaves the state machine intact", NODE_STATES.length === 8 && computeNodeState({ mvs: 80, recencyDays: 18, inboundBlocked: false, recentEdges: 0, degree: 8, createdDays: 400 }) === "stable");

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
