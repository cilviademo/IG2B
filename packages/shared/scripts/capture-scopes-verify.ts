// Capture-token scopes (Finding A) — pure.  npx tsx packages/shared/scripts/capture-scopes-verify.ts
import { CAPTURE_SCOPES, DEFAULT_CAPTURE_SCOPES, isCaptureScope, tokenHasScope, normalizeCaptureScopes } from "../src/capture-scopes";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

ok("known scopes recognized", isCaptureScope("capture:text") && isCaptureScope("capture:file") && isCaptureScope("capture:status"));
ok("privileged scopes rejected", !isCaptureScope("vault:read") && !isCaptureScope("export") && !isCaptureScope("capture:delete") && !isCaptureScope("*"));
ok("defaults are text+file (no status, no privileged)", DEFAULT_CAPTURE_SCOPES.join() === "capture:text,capture:file");

ok("tokenHasScope matches", tokenHasScope(["capture:text"], "capture:text"));
ok("tokenHasScope denies missing", !tokenHasScope(["capture:text"], "capture:file"));
ok("tokenHasScope denies non-array / privileged", !tokenHasScope(undefined as unknown, "capture:text") && !tokenHasScope(["capture:text"], "export"));

ok("normalize keeps only known scopes", normalizeCaptureScopes(["capture:file", "vault:read", "export"]).join() === "capture:file");
ok("normalize dedups", normalizeCaptureScopes(["capture:text", "capture:text"]).join() === "capture:text");
ok("normalize empty/garbage → defaults", normalizeCaptureScopes([]).join() === DEFAULT_CAPTURE_SCOPES.join() && normalizeCaptureScopes("nope").join() === DEFAULT_CAPTURE_SCOPES.join());
ok("no scope grants a privileged capability", !CAPTURE_SCOPES.some((s) => /read|delete|export|admin|chat|asset|account/.test(s)));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
