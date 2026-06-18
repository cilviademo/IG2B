// Account fingerprint — pure.  npx tsx packages/shared/scripts/account-verify.ts
import { accountFingerprint } from "../src/account";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

ok("no token → dash", accountFingerprint("") === "—" && accountFingerprint(null) === "—" && accountFingerprint(undefined) === "—");
ok("deterministic", accountFingerprint("tok_abc") === accountFingerprint("tok_abc"));
ok("same token same fingerprint (cross-surface match)", accountFingerprint("session_XYZ") === accountFingerprint("session_XYZ"));
ok("different tokens differ (fork is visible)", accountFingerprint("acctA") !== accountFingerprint("acctB"));
ok("always 6 chars for a token", /^[0-9a-z]{6}$/.test(accountFingerprint("tok_abc")) && /^[0-9a-z]{6}$/.test(accountFingerprint("x")));
ok("not the raw token (one-way)", !accountFingerprint("supersecrettoken").includes("secret"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
