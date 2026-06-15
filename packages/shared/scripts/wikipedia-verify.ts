// Wikipedia connector — pure.  npx tsx packages/shared/scripts/wikipedia-verify.ts
import { buildWikipediaUrl, parseWikipedia, wikiItemToEvidence } from "../src/wikipedia";
import { normalizeEvidence, evidenceGate } from "../src/evidence";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// 1. URL building.
{
  const u = buildWikipediaUrl("general relativity", 10);
  ok("hits public MediaWiki host", u.startsWith("https://en.wikipedia.org/w/api.php?"));
  ok("search encoded", u.includes("srsearch=general%20relativity"));
  ok("list=search + json", u.includes("list=search") && u.includes("format=json"));
  ok("srlimit clamped", buildWikipediaUrl("x", 999).includes("srlimit=50"));
}

// 2. Parse a representative response.
const SAMPLE = {
  query: {
    search: [
      { pageid: 12345, title: "Quantum entanglement", snippet: "A <span class=\"searchmatch\">quantum</span> phenomenon &amp; more", timestamp: "2026-06-01T10:00:00Z" },
      { pageid: 9, title: "", snippet: "x", timestamp: "2026-01-01T00:00:00Z" }, // no title → dropped
    ],
  },
};
{
  const raw = parseWikipedia(SAMPLE);
  ok("untitled dropped", raw.length === 1);
  const r = raw[0];
  ok("title mapped", r.title === "Quantum entanglement");
  ok("article URL with underscores", r.url === "https://en.wikipedia.org/wiki/Quantum_entanglement");
  ok("pageid as external_id", r.external_id === "wiki:12345");
  ok("snippet HTML + entities stripped", r.summary === "A quantum phenomenon & more", String(r.summary));
  ok("encyclopedia kind + license", r.source_kind === "encyclopedia" && r.license === "CC BY-SA 4.0");
  ok("timestamp carried as observed_at", r.observed_at === "2026-06-01T10:00:00Z");
}

// 3. Robustness + into the contract & gate.
{
  ok("garbage → empty", parseWikipedia(null).length === 0 && parseWikipedia({ query: {} }).length === 0);
  const e = normalizeEvidence(wikiItemToEvidence({ pageid: 1, title: "Test", snippet: "s", timestamp: "2026-06-01T00:00:00Z" }), { id: "ev1", connector: "wikipedia" });
  ok("encyclopedia evidence + gate accepts", e.source_kind === "encyclopedia" && evidenceGate(e).accept);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
