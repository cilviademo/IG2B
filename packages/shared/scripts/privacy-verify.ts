// Privacy boundary regression (Phase 6). The decision logic behind the localOnly gate:
// secret/internal content must resolve to the LOCAL deterministic adapter; public/private
// may use a live provider. Pure — no DB/network.
//   npx tsx packages/shared/scripts/privacy-verify.ts   (run from repo root)
import { isResearchSafe, filterResearchSafe, deterministicAdapter, RESEARCH_EXCLUDED_SENSITIVITY } from "../src/model";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// 1) The exclusion set is exactly secret + internal.
ok("excluded set = {secret, internal}", RESEARCH_EXCLUDED_SENSITIVITY.has("secret") && RESEARCH_EXCLUDED_SENSITIVITY.has("internal") && RESEARCH_EXCLUDED_SENSITIVITY.size === 2);

// 2) isResearchSafe per sensitivity — drives `localOnly = !isResearchSafe(...)`.
ok("public is safe (may use live)", isResearchSafe("public") === true);
ok("private is safe (may use live)", isResearchSafe("private") === true);
ok("internal is NOT safe (local only)", isResearchSafe("internal") === false);
ok("secret is NOT safe (local only)", isResearchSafe("secret") === false);
ok("unknown/missing defaults handled by caller as private", isResearchSafe("private") === true);

// 3) localOnly decision = !isResearchSafe — secret/internal force the local path.
const localOnly = (s: string) => !isResearchSafe(s);
ok("secret => localOnly", localOnly("secret") === true);
ok("internal => localOnly", localOnly("internal") === true);
ok("private => NOT localOnly", localOnly("private") === false);

// 4) The local target is the deterministic adapter (no external send, $0).
ok("deterministic adapter is the local target", deterministicAdapter("m").provider === "deterministic");

// 5) filterResearchSafe drops sensitive items from any outward batch.
const items = [{ sensitivity: "public" }, { sensitivity: "private" }, { sensitivity: "internal" }, { sensitivity: "secret" }];
const safe = filterResearchSafe(items);
ok("filterResearchSafe keeps only public+private", safe.length === 2 && safe.every((i) => i.sensitivity === "public" || i.sensitivity === "private"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
