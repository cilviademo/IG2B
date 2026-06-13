// Minimal reliable job queue on top of Redis lists.
//   enqueue -> LPUSH indigold:jobs
//   worker  -> BRPOPLPUSH indigold:jobs -> indigold:jobs:processing (then LREM on done)
// A real deployment can swap this for BullMQ without touching callers.
import { redis } from "./redis";
import type { Job, JobType } from "./types";
import { id } from "./ids";

const QUEUE = "indigold:jobs";
const PROCESSING = "indigold:jobs:processing";

export async function enqueue<T extends Record<string, unknown>>(
  type: JobType,
  userId: string,
  payload: T,
): Promise<Job<T>> {
  const job: Job<T> = { id: id("job"), type, user_id: userId, payload, enqueued_at: new Date().toISOString() };
  await redis().lpush(QUEUE, JSON.stringify(job));
  return job;
}

/** Blocking consume loop. `handler` throws to signal failure (job is re-queued).
 *  Uses a DEDICATED Redis connection: BRPOPLPUSH blocks the connection for up to its
 *  timeout, so it must never share the app's main client (rate-limit/session/etc.) — in
 *  the embedded single-service profile that would stall every API request behind the
 *  worker's blocking pop. */
export async function consume(handler: (job: Job) => Promise<void>, opts: { onError?: (e: unknown, job: Job) => void } = {}) {
  const r = redis().duplicate();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let raw: string | null;
    try {
      raw = await r.brpoplpush(QUEUE, PROCESSING, 5);
    } catch {
      // Redis briefly unavailable — back off and retry rather than crash.
      await new Promise((res) => setTimeout(res, 1000));
      continue;
    }
    if (!raw) continue;
    let job: Job | null = null;
    try {
      job = JSON.parse(raw) as Job;
      await handler(job);
      await r.lrem(PROCESSING, 1, raw);
    } catch (e) {
      opts.onError?.(e, job as Job);
      // move back to the main queue for one retry, then drop to a dead list
      await r.lrem(PROCESSING, 1, raw);
      await r.lpush("indigold:jobs:dead", raw);
    }
  }
}

export async function queueDepth() {
  return redis().llen(QUEUE);
}
