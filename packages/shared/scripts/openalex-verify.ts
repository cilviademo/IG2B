// OpenAlex connector — pure.  npx tsx packages/shared/scripts/openalex-verify.ts
import { buildOpenAlexUrl, parseOpenAlex, openAlexItemToEvidence, reconstructAbstract } from "../src/openalex";
import { normalizeEvidence, evidenceGate } from "../src/evidence";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// 1. URL building.
{
  const u = buildOpenAlexUrl("graph neural networks", 15);
  ok("hits public OpenAlex host", u.startsWith("https://api.openalex.org/works?"));
  ok("search encoded", u.includes("search=graph%20neural%20networks"));
  ok("newest first", u.includes("sort=publication_date:desc"));
  ok("polite mailto", u.includes("mailto="));
  ok("per-page clamped", buildOpenAlexUrl("x", 999).includes("per-page=50"));
}

// 2. Abstract reconstruction from inverted index.
{
  const idx = { "Quantum": [0], "error": [1], "correction": [2], "works": [3] };
  ok("inverted index → ordered text", reconstructAbstract(idx) === "Quantum error correction works");
  ok("empty/garbage abstract → empty", reconstructAbstract(undefined) === "" && reconstructAbstract({} as Record<string, number[]>) === "");
}

// 3. Parse a representative response.
const SAMPLE = {
  results: [
    {
      id: "https://openalex.org/W123", doi: "https://doi.org/10.5/x", display_name: "On Sensing",
      publication_date: "2026-05-20",
      authorships: [{ author: { display_name: "Grace Hopper" } }, { author: { display_name: "Alan Turing" } }],
      primary_location: { source: { display_name: "Science" } },
      abstract_inverted_index: { "We": [0], "measure": [1], "things": [2] },
    },
    { id: "https://openalex.org/W999", display_name: "" }, // no title → dropped
  ],
};
{
  const raw = parseOpenAlex(SAMPLE);
  ok("untitled dropped", raw.length === 1);
  const r = raw[0];
  ok("display_name as title", r.title === "On Sensing");
  ok("doi preferred for url + external_id", r.url === "https://doi.org/10.5/x" && r.external_id === "https://doi.org/10.5/x");
  ok("authorships flattened", JSON.stringify(r.authors) === JSON.stringify(["Grace Hopper", "Alan Turing"]));
  ok("source name", r.source_name === "Science");
  ok("publication_date → ISO", r.observed_at === "2026-05-20T00:00:00.000Z");
  ok("abstract reconstructed", r.summary === "We measure things");
  ok("falls back to openalex id when no doi", openAlexItemToEvidence({ id: "https://openalex.org/W5", display_name: "T" }).external_id === "https://openalex.org/W5");
}

// 4. Robustness + into the contract & gate.
{
  ok("garbage → empty", parseOpenAlex(null).length === 0 && parseOpenAlex({ x: 1 }).length === 0);
  const e = normalizeEvidence(parseOpenAlex(SAMPLE)[0], { id: "ev1", connector: "openalex" });
  ok("scholarly evidence + gate accepts", e.source_kind === "scholarly" && evidenceGate(e).accept);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
