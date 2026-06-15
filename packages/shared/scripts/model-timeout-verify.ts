// Model timeout resolver — pure.  npx tsx packages/shared/scripts/model-timeout-verify.ts
import { resolveModelTimeoutMs } from "../src/model";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

ok("default 30s when unset", resolveModelTimeoutMs({}) === 30000);
ok("honors LLM_TIMEOUT_MS", resolveModelTimeoutMs({ LLM_TIMEOUT_MS: "12000" }) === 12000);
ok("clamps too-small up to 3s floor", resolveModelTimeoutMs({ LLM_TIMEOUT_MS: "100" }) === 3000);
ok("clamps too-large down to 120s ceiling", resolveModelTimeoutMs({ LLM_TIMEOUT_MS: "999999" }) === 120000);
ok("garbage → default", resolveModelTimeoutMs({ LLM_TIMEOUT_MS: "abc" }) === 30000);
ok("zero/negative → default", resolveModelTimeoutMs({ LLM_TIMEOUT_MS: "0" }) === 30000 && resolveModelTimeoutMs({ LLM_TIMEOUT_MS: "-5" }) === 30000);
ok("always a finite positive bounded ms", (() => { const v = resolveModelTimeoutMs({ LLM_TIMEOUT_MS: "45000" }); return Number.isFinite(v) && v >= 3000 && v <= 120000; })());

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
