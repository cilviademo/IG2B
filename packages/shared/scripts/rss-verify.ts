// RSS/Atom connector — pure parser.  npx tsx packages/shared/scripts/rss-verify.ts
import { parseFeed, feedItemToEvidence } from "../src/rss";
import { normalizeEvidence, evidenceGate } from "../src/evidence";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Example Blog</title><link>https://ex.test</link>
  <item><title>First &amp; foremost</title><link>https://ex.test/1</link><guid>g-1</guid>
    <description><![CDATA[<p>Hello <b>world</b></p>]]></description><pubDate>Sun, 14 Jun 2026 10:00:00 GMT</pubDate></item>
  <item><title>Second</title><link>https://ex.test/2</link><description>plain</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Source</title>
  <entry><title>Atom One</title><link rel="alternate" href="https://a.test/1"/><id>urn:a:1</id>
    <summary>sum one</summary><updated>2026-06-10T12:00:00Z</updated></entry>
</feed>`;

// 1. RSS parsing.
{
  const f = parseFeed(RSS);
  ok("feed title", f.feedTitle === "Example Blog");
  ok("two items", f.items.length === 2);
  ok("entities decoded in title", f.items[0].title === "First & foremost");
  ok("CDATA + tags stripped from summary", f.items[0].summary === "Hello world", f.items[0].summary);
  ok("guid used", f.items[0].guid === "g-1");
  ok("pubDate → ISO", f.items[0].published === new Date("Sun, 14 Jun 2026 10:00:00 GMT").toISOString());
  ok("missing guid falls back to link", f.items[1].guid === "https://ex.test/2");
  ok("missing pubDate → null", f.items[1].published === null);
}

// 2. Atom parsing.
{
  const f = parseFeed(ATOM);
  ok("atom feed title", f.feedTitle === "Atom Source");
  ok("atom entry parsed", f.items.length === 1 && f.items[0].title === "Atom One");
  ok("atom alternate link href", f.items[0].url === "https://a.test/1");
  ok("atom id as guid", f.items[0].guid === "urn:a:1");
  ok("atom updated → ISO", f.items[0].published === "2026-06-10T12:00:00.000Z");
}

// 3. Robustness.
{
  ok("garbage in → no items, no throw", parseFeed("not xml").items.length === 0);
  ok("empty string safe", parseFeed("").items.length === 0);
}

// 4. End-to-end: feed item → evidence → gate accepts; dedup by content hash works.
{
  const f = parseFeed(RSS);
  const raw = feedItemToEvidence(f.items[0], { feedUrl: "https://ex.test/feed", feedTitle: f.feedTitle });
  const e = normalizeEvidence(raw, { id: "ev1", connector: "rss" });
  ok("maps to rss source_kind", e.source_kind === "rss");
  ok("canonical_url from item link", e.canonical_url === "https://ex.test/1");
  ok("gate accepts a clean feed item", evidenceGate(e).accept);
  ok("gate dedups by content hash", !evidenceGate(e, { seenHashes: new Set([e.content_hash]) }).accept);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
