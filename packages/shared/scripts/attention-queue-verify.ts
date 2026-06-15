// Attention Queue (Sprint 4) — pure ranker.  npx tsx packages/shared/scripts/attention-queue-verify.ts
import { buildAttentionQueue, ageDays, inboxUrgency, type AttentionCandidate } from "../src/attention-queue";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const cand = (over: Partial<AttentionCandidate> & { id: string }): AttentionCandidate => ({
  kind: "triage", title: "t", reason: "r", action: { label: "Open", verb: "open" },
  inputs: { importance: 50, urgency: 50, recencyDays: 1, signal: 0.6 }, ...over,
});

// 1. Higher composite score ranks first.
{
  const q = buildAttentionQueue([
    cand({ id: "low", inputs: { importance: 10, urgency: 10, recencyDays: 40, signal: 0.3 } }),
    cand({ id: "high", inputs: { importance: 95, urgency: 95, recencyDays: 0, signal: 0.9 } }),
  ]);
  ok("highest attention first", q[0].id === "high" && q[1].id === "low");
  ok("band reflects score (now for high)", q[0].band === "now");
}

// 2. Dismissed feedback is excluded entirely; useful boosts; not_useful demotes.
{
  const base = cand({ id: "x", inputs: { importance: 60, urgency: 60, recencyDays: 0, signal: 0.6 } });
  const plain = buildAttentionQueue([base])[0].score;
  const boosted = buildAttentionQueue([{ ...base, feedback: "useful" }])[0].score;
  const demoted = buildAttentionQueue([{ ...base, feedback: "not_useful" }])[0].score;
  ok("dismiss removes the item", buildAttentionQueue([{ ...base, feedback: "dismiss" }]).length === 0);
  ok("useful boosts score", boosted > plain);
  ok("not_useful demotes score", demoted < plain);
  ok("scores clamp to 0..100", boosted <= 100 && demoted >= 0);
}

// 3. Dedup by id; limit respected; deterministic order.
{
  const many = Array.from({ length: 12 }, (_, i) => cand({ id: `n${i}`, inputs: { importance: i * 5, urgency: 50, recencyDays: 0, signal: 0.6 } }));
  const q = buildAttentionQueue([...many, cand({ id: "n0" })], 7);
  ok("limit respected", q.length === 7);
  ok("dedup by id", new Set(q.map((x) => x.id)).size === q.length);
  const q2 = buildAttentionQueue([...many, cand({ id: "n0" })], 7);
  ok("deterministic across runs", JSON.stringify(q) === JSON.stringify(q2));
}

// 4. Tie-break by kind priority (unblock before revisit at equal score).
{
  const eq = { importance: 50, urgency: 50, recencyDays: 1, signal: 0.6 };
  const q = buildAttentionQueue([
    cand({ id: "b", kind: "revisit", inputs: eq }),
    cand({ id: "a", kind: "unblock", inputs: eq }),
  ]);
  ok("equal score → unblock outranks revisit", q[0].kind === "unblock");
}

// 5. Helpers.
{
  ok("ageDays(undefined) is large/stale", ageDays(undefined) >= 999);
  ok("ageDays computes from now", Math.round(ageDays(new Date(Date.now() - 2 * 86400000).toISOString())) === 2);
  ok("inboxUrgency ramps with age + floor 20", inboxUrgency(0) === 20 && inboxUrgency(5) === 50 && inboxUrgency(99) === 100);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
