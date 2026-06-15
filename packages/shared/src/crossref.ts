// Crossref connector (Intelligence review, Phase 2/4) — scholarly metadata from the open Crossref
// REST API (no key, ~150M works). PURE parsing + URL building (no I/O — the fetch lives in the
// worker). Maps to the `ExternalEvidence` contract (source_kind "scholarly"); DOI is the dedupe id.

const CROSSREF_BASE = "https://api.crossref.org/works";
const SELECT = ["DOI", "title", "author", "container-title", "published", "issued", "URL", "abstract"].join(",");

/** Build a Crossref query URL for a topic — newest first, metadata-only fields. */
export function buildCrossrefUrl(topic: string, rows = 15): string {
  const q = encodeURIComponent(String(topic || "").trim().slice(0, 200));
  return `${CROSSREF_BASE}?query=${q}&rows=${Math.max(1, Math.min(50, rows))}&select=${SELECT}&sort=published&order=desc`;
}

interface CrossrefAuthor { given?: string; family?: string; name?: string }
interface CrossrefItem {
  DOI?: string; title?: string[]; author?: CrossrefAuthor[]; "container-title"?: string[];
  published?: { "date-parts"?: number[][] }; issued?: { "date-parts"?: number[][] }; URL?: string; abstract?: string;
}

function datePartsToISO(dp?: number[][]): string | null {
  const p = dp && dp[0];
  if (!p || !p[0]) return null;
  const t = Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
// Crossref abstracts are JATS XML (<jats:p>…</jats:p>); strip to plain text.
function cleanAbstract(a?: string): string {
  return (a || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
}

/** Parse a Crossref `/works` response (already JSON-parsed) into raw evidence inputs. */
export function parseCrossref(json: unknown): Record<string, unknown>[] {
  const items = (json as { message?: { items?: CrossrefItem[] } })?.message?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it) => crossrefItemToEvidence(it)).filter((e) => e.title && e.title !== "(untitled)");
}

/** Map one Crossref work → loosely-typed input for `normalizeEvidence` (connector "crossref"). */
export function crossrefItemToEvidence(it: CrossrefItem): Record<string, unknown> {
  const doi = (it.DOI || "").trim();
  const authors = (it.author || [])
    .map((a) => a.name || [a.given, a.family].filter(Boolean).join(" "))
    .filter(Boolean);
  const journal = it["container-title"]?.[0] || "Crossref";
  return {
    title: it.title?.[0] || "(untitled)",
    url: it.URL || (doi ? `https://doi.org/${doi}` : ""),
    external_id: doi || it.URL || "",
    authors,
    source_name: journal,
    source_kind: "scholarly",
    summary: cleanAbstract(it.abstract),
    observed_at: datePartsToISO(it.published?.["date-parts"]) || datePartsToISO(it.issued?.["date-parts"]),
    attribution: `${journal} via Crossref`,
    license: doi ? `doi:${doi}` : null,
  };
}
