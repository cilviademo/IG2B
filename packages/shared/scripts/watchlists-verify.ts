// Watchlists cadence — pure.  npx tsx packages/shared/scripts/watchlists-verify.ts
import { watchlistDue, normalizeCadence, isCadence, CADENCES } from "../src/watchlists";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 24 * 3600e3, WEEK = 7 * DAY;

ok("cadences are daily/weekly/manual", CADENCES.join() === "daily,weekly,manual");
ok("isCadence validates", isCadence("weekly") && !isCadence("hourly"));
ok("normalizeCadence defaults to weekly", normalizeCadence("nonsense") === "weekly" && normalizeCadence(undefined) === "weekly");

ok("never-run weekly → due", watchlistDue("weekly", null, NOW));
ok("weekly run 8 days ago → due", watchlistDue("weekly", ago(8 * DAY), NOW));
ok("weekly run 2 days ago → not due", !watchlistDue("weekly", ago(2 * DAY), NOW));
ok("daily run 25h ago → due", watchlistDue("daily", ago(25 * 3600e3), NOW));
ok("daily run 2h ago → not due", !watchlistDue("daily", ago(2 * 3600e3), NOW));
ok("manual never auto-runs", !watchlistDue("manual", null, NOW) && !watchlistDue("manual", ago(WEEK * 5), NOW));
ok("invalid last_run treated as never-run", watchlistDue("weekly", "not-a-date", NOW));
ok("exactly one window elapsed → due", watchlistDue("weekly", ago(WEEK), NOW));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
