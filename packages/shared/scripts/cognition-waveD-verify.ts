// Cognition Wave D stub test — pure logic, no DB/network.
//   npx tsx packages/shared/scripts/cognition-waveD-verify.ts

import {
  AGENT_ROLES, agentActor, NEVER_DELEGATED, isDelegable, NEVER_AUTO, constitutionBlock,
  whatMatters, EXPORT_BUNDLE_VERSION,
} from "../src/cognition-d";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

async function main() {
  // D1 agent society
  ok("10 agent roles, one owner each", Object.keys(AGENT_ROLES).length === 10);
  ok("Sentinel owns budget/privacy/constraints", /budget/.test(AGENT_ROLES.Sentinel) && /privacy/.test(AGENT_ROLES.Sentinel));
  ok("actor namespacing", agentActor("Atlas") === "agent:Atlas");
  ok("no role overlap (distinct responsibilities)", new Set(Object.values(AGENT_ROLES)).size === Object.values(AGENT_ROLES).length);

  // D2 human override / constitution
  ok("6 never-delegated domains", NEVER_DELEGATED.length === 6);
  ok("values are not delegable", !isDelegable("values") && !isDelegable("Ethics"));
  ok("tooling IS delegable", isDelegable("tooling"));
  const c = constitutionBlock();
  ok("constitution states advise-not-decide", /ADVISE/.test(c) && /DECIDES/.test(c));
  ok("constitution lists never-auto boundaries", NEVER_AUTO.every((b) => c.includes(b.split(" ")[0])));
  ok("constitution forbids authoring principles", /never author/.test(c));

  // D3 wisdom — drift detection (the "80% tooling, priority is BTZ" check)
  const drifting = whatMatters(
    [{ area: "tooling", share: 0.8 }, { area: "btz", share: 0.2 }],
    ["Ship BTZ Sonic Alchemy", "Indigold"],
  );
  ok("detects activity/priority drift", !drifting.aligned && drifting.drift.some((d) => /tooling/.test(d)), JSON.stringify(drifting.drift));
  const aligned = whatMatters(
    [{ area: "btz", share: 0.7 }, { area: "indigold", share: 0.3 }],
    ["BTZ", "Indigold"],
  );
  ok("aligned activity = no drift", aligned.aligned, JSON.stringify(aligned.drift));
  ok("flags an untouched stated priority", whatMatters([{ area: "btz", share: 1 }], ["BTZ", "Education"]).drift.some((d) => /Education/.test(d)));

  // D4 export bundle shape
  ok("export bundle version set", EXPORT_BUNDLE_VERSION === "1.0.0");

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
