// Phase 2 — RSS/Atom connector (Intelligence review's first connector: open standard, no vendor,
// owner-controlled sources, GUID dedupe). PURE parsing (regex, no XML dependency — runs anywhere);
// the network fetch + scheduling live in the worker. Output maps to the `ExternalEvidence` contract,
// so new feed entries land in the Research Inbox (never auto-promoted to a memory node).

export interface FeedItem { title: string; url: string; guid: string; summary: string; published: string | null }
export interface ParsedFeed { feedTitle: string; items: FeedItem[] }

function stripCData(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}
function clean(s: string, max = 2000): string {
  return decodeEntities(stripCData(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim().slice(0, max);
}
function tagText(block: string, name: string): string {
  const m = block.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"));
  return m ? clean(m[1]) : "";
}
// Atom <link href="…"> (prefer rel="alternate"); falls back to any href.
function atomLink(block: string): string {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || block.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i);
  if (alt) return decodeEntities(alt[1]);
  const any = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return any ? decodeEntities(any[1]) : "";
}
function toISO(d: string): string | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Parse RSS 2.0 (`<item>`) or Atom (`<entry>`) feed XML into normalized items. Never throws. */
export function parseFeed(xml: string): ParsedFeed {
  const safe = String(xml || "");
  const isAtom = /<feed[\s>]/i.test(safe) && /<entry[\s>]/i.test(safe);
  const blockRe = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  // Feed title = the channel/feed <title>, taken from the head (before the first item/entry).
  const head = safe.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i)[0] || safe;
  const feedTitle = tagText(head, "title") || "Feed";

  const items: FeedItem[] = [];
  for (const m of safe.matchAll(blockRe)) {
    const b = m[0];
    const title = tagText(b, "title") || "(untitled)";
    const url = isAtom ? atomLink(b) : tagText(b, "link");
    const guid = isAtom ? tagText(b, "id") : (tagText(b, "guid") || url);
    const summary = tagText(b, isAtom ? "summary" : "description") || tagText(b, "content");
    const published = toISO(isAtom ? (tagText(b, "updated") || tagText(b, "published")) : tagText(b, "pubDate"));
    items.push({ title, url, guid: guid || url, summary, published });
  }
  return { feedTitle, items };
}

/** Map a feed item → loosely-typed input for `normalizeEvidence` (connector "rss"). */
export function feedItemToEvidence(item: FeedItem, opts: { feedUrl: string; feedTitle: string }): Record<string, unknown> {
  return {
    title: item.title,
    url: item.url || opts.feedUrl,
    external_id: item.guid || item.url || opts.feedUrl,
    summary: item.summary,
    observed_at: item.published,
    source_kind: "rss",
    source_name: opts.feedTitle,
    attribution: `${opts.feedTitle} (RSS)`,
  };
}
