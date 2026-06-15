// Owner intents — pure.  npx tsx packages/shared/scripts/intent-verify.ts
import { OWNER_INTENTS, isOwnerIntent, intentToMode, intentLabel, intentGuidance, allIntents } from "../src/intent";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

ok("five intents", OWNER_INTENTS.length === 5 && OWNER_INTENTS.join() === "remember,explain,check,research,decide");
ok("isOwnerIntent validates", isOwnerIntent("check") && !isOwnerIntent("vault") && !isOwnerIntent(""));

// intent → mode mapping
ok("remember → vault", intentToMode("remember") === "vault");
ok("explain → general", intentToMode("explain") === "general");
ok("check → web (verify needs sources)", intentToMode("check") === "web");
ok("research → research", intentToMode("research") === "research");
ok("decide → general", intentToMode("decide") === "general");
ok("unknown intent → auto (backward compatible)", intentToMode("nonsense") === "auto");

// labels + guidance
ok("labels human", intentLabel("remember") === "My memory" && intentLabel("check") === "Check");
ok("every intent has non-empty guidance", OWNER_INTENTS.every((i) => intentGuidance(i).length > 20));
ok("unknown intent → empty guidance", intentGuidance("nope") === "");
ok("check guidance mentions verify + contradictions", /verif|contradict/i.test(intentGuidance("check")));
ok("decide guidance mentions options + recommendation", /option/i.test(intentGuidance("decide")) && /recommend/i.test(intentGuidance("decide")));
ok("remember guidance is vault-only", /vault/i.test(intentGuidance("remember")) && /never invent|don't invent|not there/i.test(intentGuidance("remember")));

// allIntents spec round-trip
{
  const all = allIntents();
  ok("allIntents returns 5 full specs", all.length === 5 && all.every((s) => s.intent && s.label && s.mode && s.blurb && s.guidance));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
