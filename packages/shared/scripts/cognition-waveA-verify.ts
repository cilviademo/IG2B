// Cognition Wave A stub test — pure logic, no DB/network.
// Validates the event vocabulary, lifecycle-replay ordering (simulated store), and
// the VectorStore fallback. Run: npx tsx packages/shared/scripts/cognition-waveA-verify.ts

import { EVENT_TYPES, isEventType, type IndigoldEvent, type EventType } from "../src/events";
import { tagEntityStore, getVectorStore, type Retrievable } from "../src/vectorstore";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// In-memory event store mirroring the db repo's contract (append-only + replay).
function makeStore() {
  const log: IndigoldEvent[] = [];
  let seq = 0;
  return {
    append(e: Omit<IndigoldEvent, "id" | "ts">) {
      const ev: IndigoldEvent = { ...e, id: `evt_${seq}`, ts: new Date(2026, 0, 1, 0, 0, seq).toISOString() };
      seq++;
      log.push(ev); // never mutates/deletes prior entries
      return ev.id;
    },
    byCorrelation(cid: string) { return log.filter((e) => e.correlation_id === cid); },
    all() { return log; },
  };
}

async function main() {
  // Vocabulary
  ok("event vocabulary is non-trivial", EVENT_TYPES.length >= 18);
  ok("isEventType accepts a known type", isEventType("capture_created"));
  ok("isEventType rejects unknown", !isEventType("totally_made_up"));

  // Replay: a single capture's full lifecycle by correlation_id, in order
  const store = makeStore();
  const cid = "cap_123";
  store.append({ user_id: "u", actor: "user", event_type: "capture_created", subject_type: "capture", subject_id: cid, correlation_id: cid, payload: {} });
  store.append({ user_id: "u", actor: "agent:Atlas", event_type: "node_created", subject_type: "node", subject_id: "node_1", correlation_id: cid, payload: {} });
  store.append({ user_id: "u", actor: "agent:Radian", event_type: "classified", subject_type: "capture", subject_id: cid, correlation_id: cid, payload: { nodeId: "node_1" } });
  store.append({ user_id: "u", actor: "agent:Atlas", event_type: "edge_created", subject_type: "edge", subject_id: "edge_1", correlation_id: cid, payload: {} });
  // an unrelated capture's event must not leak into the replay
  store.append({ user_id: "u", actor: "user", event_type: "capture_created", subject_type: "capture", subject_id: "cap_other", correlation_id: "cap_other", payload: {} });

  const replay = store.byCorrelation(cid);
  ok("replay returns the capture's lifecycle only", replay.length === 4 && replay.every((e) => e.correlation_id === cid));
  ok("replay is ordered (created → classified → edge)", replay[0].event_type === "capture_created" && replay[replay.length - 1].event_type === "edge_created");
  ok("every event carries an actor", replay.every((e) => !!e.actor));
  ok("agent actors are namespaced", replay.some((e) => String(e.actor).startsWith("agent:")));
  ok("append-only: nothing was mutated/removed", store.all().length === 5);

  // VectorStore fallback (seam ready; pgvector deferred)
  const candidates: Retrievable[] = [
    { subject_type: "node", subject_id: "a", title: "DSP modulation library", text: "audio plugin modulation", tags: ["dsp", "audio"] },
    { subject_type: "node", subject_id: "b", title: "Cooking notes", text: "pasta recipe", tags: ["food"] },
    { subject_type: "node", subject_id: "c", title: "Audio plugin ideas", text: "saturation and modulation", tags: ["audio", "plugin"] },
  ];
  const matches = tagEntityStore.search({ text: "modulation audio plugin", tags: ["audio"] }, candidates, 5);
  ok("vector fallback ranks related nodes first", matches[0]?.subject_id === "a" || matches[0]?.subject_id === "c");
  ok("vector fallback excludes the unrelated node", !matches.some((m) => m.subject_id === "b"));
  ok("matches carry a 'why'", !!matches[0]?.why);
  ok("getVectorStore returns the active backend", getVectorStore().backend === "tag-entity");

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
