// Evidence foundation (Phase 1) — pure.  npx tsx packages/shared/scripts/evidence-verify.ts
import { normalizeEvidence, evidenceHash, isStale, evidenceGate, type ExternalEvidence } from "../src/evidence";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const ev = (over: Partial<Record<string, unknown>> = {}) =>
  normalizeEvidence({ title: "A paper", url: "https://x.test/a", source_kind: "scholarly", summary: "s", ...over }, { id: "ev1", connector: "crossref", now: NOW });

// 1. Normalization: safe defaults + field mapping.
{
  const e = ev();
  ok("retrieved_at set from now", e.retrieved_at === new Date(NOW).toISOString());
  ok("status defaults to new", e.status === "new");
  ok("unknown source_kind → web", normalizeEvidence({ title: "t", url: "u", source_kind: "bogus" }, { id: "x", connector: "c", now: NOW }).source_kind === "web");
  ok("missing title → placeholder", normalizeEvidence({ url: "u" }, { id: "x", connector: "c", now: NOW }).title === "(untitled)");
  ok("external_id falls back to guid/doi/url", ev({ external_id: undefined, guid: "G1" }).external_id === "G1");
  ok("authors coerced to string[]", JSON.stringify(ev({ authors: ["a", 2] }).authors) === JSON.stringify(["a", "2"]));
}

// 2. evidenceHash deterministic + sensitive to content.
{
  ok("hash deterministic", evidenceHash(["a", "b"]) === evidenceHash(["a", "b"]));
  ok("hash changes with content", evidenceHash(["a", "b"]) !== evidenceHash(["a", "c"]));
  ok("hash is 8-hex", /^[0-9a-f]{8}$/.test(evidenceHash(["x"])));
  ok("nullish parts tolerated", typeof evidenceHash([null, undefined, "x"]) === "string");
}

// 3. isStale on valid_until / refresh_after.
{
  ok("future valid_until → fresh", !isStale({ valid_until: new Date(NOW + 86400000).toISOString(), refresh_after: null }, NOW));
  ok("past valid_until → stale", isStale({ valid_until: new Date(NOW - 1).toISOString(), refresh_after: null }, NOW));
  ok("past refresh_after → stale", isStale({ valid_until: null, refresh_after: new Date(NOW - 1).toISOString() }, NOW));
  ok("no dates → not stale", !isStale({ valid_until: null, refresh_after: null }, NOW));
}

// 4. evidenceGate: dedup, kind filter, empties.
{
  const e = ev();
  ok("accepts clean evidence", evidenceGate(e).accept);
  ok("rejects duplicate by hash", !evidenceGate(e, { seenHashes: new Set([e.content_hash]) }).accept);
  ok("rejects disallowed kind", evidenceGate(e, { allowKinds: ["rss"] }).reason === "kind_not_allowed");
  ok("rejects missing url", !evidenceGate({ ...e, canonical_url: "" } as ExternalEvidence).accept);
  ok("rejects untitled", evidenceGate({ ...e, title: "(untitled)" } as ExternalEvidence).reason === "no_title");
}

// 5. Evidence is never auto-promoted — status starts "new" (Research Inbox), summary capped.
{
  const big = ev({ summary: "x".repeat(5000) });
  ok("summary capped to 2000", big.summary.length === 2000);
  ok("starts in the inbox (new)", big.status === "new");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
