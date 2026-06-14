// Regression test for the worker-Redis perf fix (Phase 3.2). Locks the invariant
// that BRPOPLPUSH runs on a DEDICATED connection, never the shared redis() client —
// the bug that stalled every API request ~15s. No real Redis traffic: the blocking
// connection is injected via the `connect` test seam and the loop is bounded by
// `maxIterations`.
//   npx tsx packages/shared/scripts/queue-verify.ts   (run from repo root)
import { consume } from "../src/queue";
import { redis } from "../src/redis";
import type { Job, JobType } from "../src/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

function fakeClient(queue: string[]) {
  const calls = { brpoplpush: 0, lrem: 0, lpush: 0 };
  const c = {
    calls,
    async brpoplpush() { calls.brpoplpush++; return queue.shift() ?? null; },
    async lrem() { calls.lrem++; return 1; },
    async lpush() { calls.lpush++; return 1; },
  };
  return c;
}

async function main() {
  const shared = redis(); // real singleton; we never issue real commands on it
  let sharedTouched = false;
  (shared as unknown as { brpoplpush: () => Promise<null> }).brpoplpush = async () => { sharedTouched = true; return null; };

  // 1) A job is processed on the DEDICATED connection, not the shared client.
  const job: Job = { id: "job_1", type: "ask" as JobType, user_id: "u1", payload: {}, enqueued_at: new Date().toISOString() };
  const dedicated = fakeClient([JSON.stringify(job)]);
  let handled: string | null = null;
  await consume(async (j) => { handled = j.id; }, { connect: () => dedicated as never, maxIterations: 1 });
  ok("handler ran on the dequeued job", handled === "job_1");
  ok("blocking pop used the dedicated connection", dedicated.calls.brpoplpush === 1);
  ok("shared client NOT used for the blocking pop", sharedTouched === false);
  ok("processing entry removed on success (lrem)", dedicated.calls.lrem === 1);

  // 2) The guard fires if a refactor points blocking at the shared client.
  let guard = false;
  try {
    await consume(async () => {}, { connect: (s) => s, maxIterations: 1 });
  } catch (e) { guard = /dedicated/i.test((e as Error).message); }
  ok("guard throws when blocking would use the shared client", guard);

  // 3) maxIterations bounds the loop (terminable + testable).
  const empty = fakeClient([]);
  await consume(async () => {}, { connect: () => empty as never, maxIterations: 3 });
  ok("loop honored maxIterations (3 empty polls)", empty.calls.brpoplpush === 3);

  // 4) A throwing handler dead-letters without killing the loop.
  const dl = fakeClient([JSON.stringify(job)]);
  let onErr = false;
  await consume(async () => { throw new Error("boom"); }, { connect: () => dl as never, maxIterations: 1, onError: () => { onErr = true; } });
  ok("handler failure routed to onError", onErr);
  ok("failed job moved to dead list (lpush)", dl.calls.lpush === 1);

  redis().disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
