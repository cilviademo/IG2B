// Capture enrichment for social / JS / link captures (Intelligence). When the readable-page
// fetch fails (Instagram/X/TikTok/YouTube are bot-blocked or JS-only), fall back to the site's
// open oEmbed endpoint so a capture carries real substance (title/author/provider) instead of a
// bare domain — the root cause of "generic" Radian answers. PURE: URL mapping + JSON parsing +
// a thin-content detector. The fetch itself lives in the worker. No keys (IG/X full oEmbed needs
// a token → returns null honestly; open providers like YouTube/Vimeo/TikTok work without one).

/** Map a known social/media URL to its OPEN oEmbed endpoint, or null when none is usable. */
export function oEmbedUrlFor(pageUrl: string): string | null {
  let host: string;
  try { host = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
  const u = encodeURIComponent(pageUrl);
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return `https://www.youtube.com/oembed?url=${u}&format=json`;
  if (host === "vimeo.com") return `https://vimeo.com/api/oembed.json?url=${u}`;
  if (host === "tiktok.com") return `https://www.tiktok.com/oembed?url=${u}`;
  if (host === "soundcloud.com") return `https://soundcloud.com/oembed?format=json&url=${u}`;
  if (host === "flickr.com") return `https://www.flickr.com/services/oembed?format=json&url=${u}`;
  // Instagram / X(Twitter) oEmbed now require an app token → not usable unauthenticated.
  return null;
}

export interface OEmbed { title: string; author: string; provider: string; thumbnail: string | null }

/** Parse an oEmbed JSON response into normalized fields (safe defaults). */
export function parseOEmbed(json: unknown): OEmbed | null {
  const o = json as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const title = s(o.title).slice(0, 300);
  const author = s(o.author_name).slice(0, 120);
  const provider = s(o.provider_name).slice(0, 80);
  if (!title && !author) return null;
  return { title: title || "(untitled)", author, provider, thumbnail: s(o.thumbnail_url) || null };
}

/** Build a content snippet from an oEmbed (for the classifier / node summary). */
export function oEmbedToContent(e: OEmbed): string {
  return [e.title, e.author && `by ${e.author}`, e.provider && `(${e.provider})`].filter(Boolean).join(" ").trim();
}

/** Is the extracted content effectively empty — just a domain/title with no real body? When true,
 *  the capture should be flagged "needs content" so Radian asks once instead of answering generically. */
export function isThinContent(content: string | undefined | null, title: string, url?: string): boolean {
  const body = String(content ?? "").replace(/\s+/g, " ").trim();
  if (body.length >= 40) return false; // has some real substance
  const host = (() => { try { return url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { return ""; } })();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Empty, or the "content" is just the title or the bare domain → thin.
  if (!body) return true;
  return norm(body) === norm(title) || (!!host && norm(body) === norm(host)) || norm(body) === norm(host.split(".")[0] || "");
}
