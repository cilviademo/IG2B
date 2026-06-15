// Wikipedia connector (Intelligence review, Phase 2/4) — encyclopedia via the open MediaWiki API
// (no key). PURE parsing + URL building; fetch lives in the worker. Maps to the `ExternalEvidence`
// contract (source_kind "encyclopedia"); pageid is the dedupe id. CC BY-SA — attribution carried.

const WIKI_API = "https://en.wikipedia.org/w/api.php";

/** Build a MediaWiki full-text search URL (snippet + timestamp). */
export function buildWikipediaUrl(topic: string, limit = 10): string {
  const q = encodeURIComponent(String(topic || "").trim().slice(0, 200));
  return `${WIKI_API}?action=query&list=search&srsearch=${q}&srlimit=${Math.max(1, Math.min(50, limit))}&srprop=snippet%7Ctimestamp&format=json&origin=*`;
}

interface WikiHit { pageid?: number; title?: string; snippet?: string; timestamp?: string }

function stripSnippet(s?: string): string {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, " ").trim().slice(0, 600);
}

/** Parse a MediaWiki search response (already JSON-parsed) into raw evidence inputs. */
export function parseWikipedia(json: unknown): Record<string, unknown>[] {
  const hits = (json as { query?: { search?: WikiHit[] } })?.query?.search;
  if (!Array.isArray(hits)) return [];
  return hits.map(wikiItemToEvidence).filter((e) => e.title && e.title !== "(untitled)");
}

/** Map one Wikipedia hit → loosely-typed input for `normalizeEvidence` (connector "wikipedia"). */
export function wikiItemToEvidence(it: WikiHit): Record<string, unknown> {
  const title = (it.title || "").trim() || "(untitled)";
  return {
    title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    external_id: it.pageid ? `wiki:${it.pageid}` : title,
    summary: stripSnippet(it.snippet),
    source_kind: "encyclopedia",
    source_name: "Wikipedia",
    observed_at: it.timestamp || null,
    attribution: "Wikipedia (CC BY-SA)",
    license: "CC BY-SA 4.0",
  };
}
