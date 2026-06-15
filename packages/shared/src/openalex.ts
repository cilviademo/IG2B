// OpenAlex connector (Intelligence review, Phase 2/4) — open scholarly graph (~250M works, no
// key). PURE parsing + URL building; fetch lives in the worker. Maps to the `ExternalEvidence`
// contract (source_kind "scholarly"); DOI/OpenAlex-id is the dedupe id. Complements Crossref.

const OPENALEX_BASE = "https://api.openalex.org/works";

/** Build an OpenAlex search URL — newest first, polite-pool mailto. */
export function buildOpenAlexUrl(topic: string, perPage = 15): string {
  const q = encodeURIComponent(String(topic || "").trim().slice(0, 200));
  return `${OPENALEX_BASE}?search=${q}&per-page=${Math.max(1, Math.min(50, perPage))}&sort=publication_date:desc&mailto=owner@indigold.app`;
}

interface OpenAlexWork {
  id?: string; doi?: string; title?: string; display_name?: string;
  publication_date?: string;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } };
  abstract_inverted_index?: Record<string, number[]>;
}

/** OpenAlex stores abstracts as a word→positions inverted index; reconstruct readable text. */
export function reconstructAbstract(idx?: Record<string, number[]>): string {
  if (!idx || typeof idx !== "object") return "";
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(idx)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (typeof p === "number" && p >= 0 && p < 5000) slots[p] = word;
  }
  return slots.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
}

/** Parse an OpenAlex `/works` response (already JSON-parsed) into raw evidence inputs. */
export function parseOpenAlex(json: unknown): Record<string, unknown>[] {
  const results = (json as { results?: OpenAlexWork[] })?.results;
  if (!Array.isArray(results)) return [];
  return results.map(openAlexItemToEvidence).filter((e) => e.title && e.title !== "(untitled)");
}

/** Map one OpenAlex work → loosely-typed input for `normalizeEvidence` (connector "openalex"). */
export function openAlexItemToEvidence(it: OpenAlexWork): Record<string, unknown> {
  const doi = (it.doi || "").trim();
  const url = doi || it.id || "";
  const authors = (it.authorships || []).map((a) => a.author?.display_name || "").filter(Boolean);
  const source = it.primary_location?.source?.display_name || "OpenAlex";
  return {
    title: it.display_name || it.title || "(untitled)",
    url,
    external_id: doi || it.id || "",
    authors,
    source_name: source,
    source_kind: "scholarly",
    summary: reconstructAbstract(it.abstract_inverted_index),
    observed_at: it.publication_date ? `${it.publication_date}T00:00:00.000Z` : null,
    attribution: `${source} via OpenAlex`,
  };
}
