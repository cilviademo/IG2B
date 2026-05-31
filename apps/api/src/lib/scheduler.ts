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

  const isMonday = new Date().getUTCDay() === 1;
  const res = await query<{ id: string }>("SELECT id FROM users");
  for (const u of res.rows) {
    await enqueue("daily_brief", u.id, {});
    await enqueue("monitor_scan", u.id, {});
    if (isMonday) await enqueue("weekly_review", u.id, {});
  }
  console.log(`[api/scheduler] fan-out for ${res.rows.length} users (weekly=${isMonday})`);
}

export function startScheduler() {
  const tick = () => runOncePerDay().catch((e) => console.error("[api/scheduler]", (e as Error).message));
  tick();
  setInterval(tick, 30 * 60 * 1000); // every 30 min
  console.log(`[api/scheduler] enabled (fires daily ~${HOUR}:00 UTC)`);
}
