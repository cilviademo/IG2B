// Cron entrypoint (Render Cron Job). Runs once per invocation, enqueues recurring
// work for every user, then exits. A single daily schedule fans out to the right
// cadences: daily briefs every run, weekly reviews on Mondays, monitor scans daily.
import { query } from "@indigold/db";
import { enqueue, redis } from "@indigold/shared";

async function main() {
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const task = process.env.SCHEDULER_TASK || "auto"; // auto | daily | weekly | monitor

  const res = await query<{ id: string }>("SELECT id FROM users");
  for (const u of res.rows) {
    if (task === "auto" || task === "daily") await enqueue("daily_brief", u.id, {});
    if (task === "monitor" || task === "auto") await enqueue("monitor_scan", u.id, {});
    if (task === "weekly" || (task === "auto" && isMonday)) await enqueue("weekly_review", u.id, {});
  }
  console.log(`[scheduler] task=${task} users=${res.rows.length} weekly=${isMonday}`);
  await redis().quit();
  process.exit(0);
}

main().catch((e) => {
  console.error("[scheduler] failed:", e);
  process.exit(1);
});
