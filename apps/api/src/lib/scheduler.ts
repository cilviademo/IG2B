// In-process self-scheduler for the low-cost single-service topology. Replaces
// the separate Render Cron Job: an always-on API checks hourly and fans out the
// daily/weekly/monitor jobs once per day (guarded in Redis to avoid duplicates).
import { query } from "@indigold/db";
import { enqueue, redis } from "@indigold/shared";

const HOUR = Number(process.env.SCHEDULER_HOUR || 13); // UTC hour to fire

async function runOncePerDay() {
  if (new Date().getUTCHours() < HOUR) return;
  const today = new Date().toISOString().slice(0, 10);
  const last = await redis().get("scheduler:lastrun");
  if (last === today) return; // already fanned out today
  await redis().set("scheduler:lastrun", today);

  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const isMonthFirst = now.getUTCDate() === 1;
  const isQuarterFirst = isMonthFirst && now.getUTCMonth() % 3 === 0; // Jan/Apr/Jul/Oct 1
  const isYearFirst = isMonthFirst && now.getUTCMonth() === 0; // Jan 1
  const res = await query<{ id: string }>("SELECT id FROM users");
  for (const u of res.rows) {
    await enqueue("daily_brief", u.id, {});
    await enqueue("monitor_scan", u.id, {});
    await enqueue("consolidate", u.id, {}); // Stage 9 nightly
    if (isMonday) {
      await enqueue("weekly_review", u.id, {});
      await enqueue("opportunity_scan", u.id, {}); // Stage 7 weekly
      await enqueue("export_bundle", u.id, {}); // Wave D4 weekly no-lock-in dump
    }
    if (isMonthFirst) {
      await enqueue("calibration", u.id, {}); // Stage 8 monthly
      await enqueue("monthly_review", u.id, {}); // Wave C2 monthly (+ shadow memory)
    }
    if (isQuarterFirst) await enqueue("quarterly_review", u.id, {}); // Wave C2 quarterly
    if (isYearFirst) await enqueue("annual_review", u.id, {}); // Wave C2 annual
  }
  console.log(`[api/scheduler] fan-out for ${res.rows.length} users (weekly=${isMonday}, monthly=${isMonthFirst}, quarter=${isQuarterFirst}, year=${isYearFirst})`);
}

export function startScheduler() {
  const tick = () => runOncePerDay().catch((e) => console.error("[api/scheduler]", (e as Error).message));
  tick();
  setInterval(tick, 30 * 60 * 1000); // every 30 min
  console.log(`[api/scheduler] enabled (fires daily ~${HOUR}:00 UTC)`);
}
