// Minimal reliable job queue on top of Redis lists.
//   enqueue -> LPUSH indigold:jobs
//   worker  -> BRPOPLPUSH indigold:jobs -> indigold:jobs:processing (then LREM on done)
// A real deployment can swap this for BullMQ without touching callers.
import { redis } from "./redis";
import type { Job, JobType } from "./types";
import { id } from "./ids";

const QUEUE = "indigold:jobs";

// Wave 6 — the media pipeline runs on a SEPARATE Redis list consumed only by the
// dedicated Docker media-worker. This keeps heavy transcription off the in-process
// API worker and (critically) stops the in-process worker from popping a job it has
// no binaries for and dead-lettering it before the media-worker can take it.
export const MEDIA_QUEUE = "indigold:jobs:media";

// Bounded retries: a failing handler is re-queued (head of the main list, so other
// jobs go first) until it has been attempted MAX_ATTEMPTS times, then dead-lettered.
const MAX_ATTEMPTS = 3;

export async function enqueue<T extends Record<string, unknown>>(
  type: JobType,
  userId: string,
  payload: T,
  queue: string = QUEUE,
): Promise<Job<T>> {
  const job: Job<T> = { id: id("job"), type, user_id: userId, payload, enqueued_at: new Date().toISOString() };
  await redis().lpush(queue, JSON.stringify(job));
  return job;
}

export interface ConsumeOpts {
  onError?: (e: unknown, job: Job) => void;
  /** Which Redis list to consume (default: the main job queue). The media-worker
   *  passes `MEDIA_QUEUE`; processing/dead lists are derived from it. */
  queue?: string;
  /** Test seam ONLY. Production always uses `redis().duplicate()`. Receives the shared
   *  client so a test can return a fake (or deliberately return it to assert the guard). */
  connect?: (shared: ReturnType<typeof redis>) => ReturnType<typeof redis>;
  /** Test seam ONLY. Stop after N iterations (default: run forever). */
  maxIterations?: number;
}

/** Blocking consume loop. `handler` throws to signal failure (job is re-queued).
 *  Uses a DEDICATED Redis connection: BRPOPLPUSH blocks the connection for up to its
 *  timeout, so it must never share the app's main client (rate-limit/session/etc.) — in
 *  the embedded single-service profile that would stall every API request behind the
 *  worker's blocking pop. */
export async function consume(handler: (job: Job) => Promise<void>, opts: ConsumeOpts = {}) {
  const shared = redis();
  // ⚠️ PERF GUARD — DO NOT REVERT to the shared client. BRPOPLPUSH holds its connection
  // for the whole 5s block; on the shared app client that stalled EVERY API request
  // (~15s) in the embedded profile. Root-caused 2026-06-13 (see 05_DEBUGGING_LOG.md).
  // The assertion fails loudly if a future refactor swaps the duplicate() back out.
  const r = opts.connect ? opts.connect(shared) : shared.duplicate();
  if (r === shared) throw new Error("queue.consume: blocking BRPOPLPUSH must use a DEDICATED Redis connection, not the shared redis() client");
  const queue = opts.queue ?? QUEUE;
  const processing = `${queue}:processing`;
  const dead = `${queue}:dead`;
  const max = opts.maxIterations ?? Infinity;
  let iterations = 0;
  while (iterations < max) {
    iterations++;
    let raw: string | null;
    try {
      raw = await r.brpoplpush(queue, processing, 5);
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
      await r.lrem(processing, 1, raw);
    } catch (e) {
      opts.onError?.(e, job as Job);
      await r.lrem(processing, 1, raw);
      // Bounded retry: re-queue with an incremented attempt count until the cap,
      // then dead-letter. (Re-queues to the head so other jobs run first = backoff.)
      const attempts = (job?.attempts ?? 0) + 1;
      if (job && attempts < MAX_ATTEMPTS) {
        await r.lpush(queue, JSON.stringify({ ...job, attempts }));
      } else {
        await r.lpush(dead, raw);
      }
    }
  }
}

/** Crash recovery: requeue jobs orphaned in `<queue>:processing` by a worker that
 *  died mid-handler. Call ONCE at startup, BEFORE consume (single consumer per queue,
 *  so nothing is legitimately in-flight yet). Returns how many were recovered. */
export async function recoverStale(queue: string = QUEUE, client = redis()): Promise<number> {
  const processing = `${queue}:processing`;
  let n = 0;
  // RPOPLPUSH moves processing → main queue atomically; loop until empty (safety cap).
  while (n < 10000) {
    const moved = await client.rpoplpush(processing, queue);
    if (!moved) break;
    n++;
  }
  return n;
}

export async function queueDepth() {
  return redis().llen(QUEUE);
}
