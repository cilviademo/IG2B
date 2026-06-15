import { consume, recoverStale } from "@indigold/shared";
import { handlers } from "./jobs/handlers";

console.log("[indigold-worker] starting; waiting for jobs…");

// Crash recovery: requeue any jobs orphaned in :processing by a prior crash.
recoverStale().then((n) => { if (n) console.log(`[worker] recovered ${n} orphaned job(s)`); }).catch(() => {});

consume(
  async (job) => {
    const h = handlers[job.type];
    if (!h) {
      console.warn("[worker] no handler for job type:", job.type);
      return;
    }
    const t0 = Date.now();
    await h(job);
    console.log(`[worker] ${job.type} ${job.id} done in ${Date.now() - t0}ms`);
  },
  { onError: (e, job) => console.error(`[worker] job ${job?.type} failed:`, (e as Error)?.message) },
).catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
