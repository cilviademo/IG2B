// Crossref connector — pure.  npx tsx packages/shared/scripts/crossref-verify.ts
import { buildCrossrefUrl, parseCrossref, crossrefItemToEvidence } from "../src/crossref";
import { normalizeEvidence, evidenceGate } from "../src/evidence";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// 1. URL building: encoded query, bounded rows, newest-first, public host.
{
  const u = buildCrossrefUrl("quantum sensing", 15);
  ok("hits public Crossref host", u.startsWith("https://api.crossref.org/works?"));
  ok("query encoded", u.includes("query=quantum%20sensing"));
  ok("sorts newest first", u.includes("sort=published") && u.includes("order=desc"));
  ok("rows clamped (≤50)", buildCrossrefUrl("x", 999).includes("rows=50"));
}

// 2. Parse a representative Crossref response.
const SAMPLE = {
  message: {
    items: [
      {
        DOI: "10.1234/abc", title: ["A Breakthrough in Sensing"],
        author: [{ given: "Ada", family: "Lovelace" }, { name: "R. Feynman" }],
        "container-title": ["Nature Physics"],
        published: { "date-parts": [[2026, 5, 10]] },
        URL: "https://doi.org/10.1234/abc",
        abstract: "<jats:p>We report <b>record</b> sensitivity.</jats:p>",
      },
      { title: [], DOI: "10.9/empty" }, // no title → dropped
    ],
  },
};
{
  const raw = parseCrossref(SAMPLE);
  ok("untitled items dropped", raw.length === 1);
  const r = raw[0];
  ok("title mapped", r.title === "A Breakthrough in Sensing");
  ok("DOI as external_id", r.external_id === "10.1234/abc");
  ok("authors flattened (given+family / name)", JSON.stringify(r.authors) === JSON.stringify(["Ada Lovelace", "R. Feynman"]));
  ok("journal as source_name", r.source_name === "Nature Physics");
  ok("scholarly kind", r.source_kind === "scholarly");
  ok("JATS stripped from abstract", r.summary === "We report record sensitivity.");
  ok("published → ISO", r.observed_at === new Date(Date.UTC(2026, 4, 10)).toISOString());
}

// 3. Robustness + end-to-end into the evidence contract & gate.
{
  ok("garbage → empty", parseCrossref({ nope: true }).length === 0 && parseCrossref(null).length === 0);
  const e = normalizeEvidence(crossrefItemToEvidence(SAMPLE.message.items[0]), { id: "ev1", connector: "crossref" });
  ok("normalizes to scholarly evidence", e.source_kind === "scholarly" && e.canonical_url === "https://doi.org/10.1234/abc");
  ok("gate accepts", evidenceGate(e).accept);
  const e2 = normalizeEvidence(crossrefItemToEvidence(SAMPLE.message.items[0]), { id: "ev2", connector: "crossref" });
  ok("same work dedupes by content hash", e.content_hash === e2.content_hash);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
