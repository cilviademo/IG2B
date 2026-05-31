// Deterministic, client-side auto-classifier for shared content.
// "I already know what this is." — infers type/source/domain/media/tags with no
// questions asked. This is the local-first stand-in for the backend AI enrichment
// stage; the same shape flows into the graph/context pipeline once wired to the API.
import type { CaptureType, Sensitivity } from "./types";

export type Domain = "content" | "knowledge" | "reference" | "media";
export type Media = "video" | "image" | "article" | "text" | "audio" | "link";

export interface ShareInput {
  url?: string;
  title?: string;
  text?: string;
  source?: string;
  note?: string;
}

export interface Classified {
  type: CaptureType;
  source: string;
  domain: Domain;
  media: Media;
  title: string;
  url: string;
  body: string;
  note: string;
  tags: string[];
  sensitivity: Sensitivity;
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "about",
  "have", "will", "https", "http", "www", "com", "html", "amp", "utm",
]);

function keywords(text: string, max = 4): string[] {
  const counts = new Map<string, number>();
  for (const w of (text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [])) {
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

function looksLikeUrl(s?: string): boolean {
  return !!s && /^https?:\/\/\S+$/i.test(s.trim());
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

interface HostRule {
  match: RegExp;
  type: CaptureType;
  source: string;
  domain: Domain;
  media: Media;
}

const HOST_RULES: HostRule[] = [
  { match: /instagram\.com/, type: "instagram_reel", source: "instagram", domain: "content", media: "video" },
  { match: /threads\.(net|com)/, type: "threads_post", source: "threads", domain: "content", media: "text" },
  { match: /(youtube\.com|youtu\.be)/, type: "web_link", source: "youtube", domain: "content", media: "video" },
  { match: /tiktok\.com/, type: "web_link", source: "tiktok", domain: "content", media: "video" },
  { match: /(twitter\.com|x\.com)/, type: "web_link", source: "x", domain: "content", media: "text" },
];

export function classifyShared(input: ShareInput): Classified {
  // Resolve a URL from explicit url, or text that is itself a URL.
  const rawUrl = input.url?.trim() || (looksLikeUrl(input.text) ? input.text!.trim() : "");
  const host = rawUrl ? hostOf(rawUrl) : "";
  // body is the shared text unless that text was actually the URL.
  const body = (input.text && input.text.trim() !== rawUrl ? input.text : "") || "";
  const note = input.note?.trim() || "";
  const srcHint = (input.source || "").toLowerCase();

  let type: CaptureType;
  let source: string;
  let domain: Domain;
  let media: Media;

  const rule = host ? HOST_RULES.find((r) => r.match.test(host)) : undefined;
  if (rule) {
    ({ type, source, domain, media } = rule);
  } else if (rawUrl) {
    // generic link
    type = "web_link";
    source = srcHint || host || "web";
    domain = "reference";
    media = "article";
  } else if (/note/.test(srcHint)) {
    type = "apple_note";
    source = "apple_notes";
    domain = "knowledge";
    media = "text";
  } else if (/chatgpt|claude|assistant|gpt|llm/.test(srcHint)) {
    type = "llm_conversation";
    source = srcHint || "assistant_export";
    domain = "knowledge";
    media = "text";
  } else {
    type = "manual_text";
    source = srcHint || "manual";
    domain = "knowledge";
    media = "text";
  }

  const title =
    (input.title && input.title.trim()) ||
    (body ? body.replace(/\s+/g, " ").trim().slice(0, 60) : "") ||
    (rawUrl ? `${source} · ${host || "link"}` : `${source} capture`);

  const tagSeed = `${input.title || ""} ${body} ${host.replace(/\.[a-z]+$/, "")}`;
  const tags = [...new Set([...keywords(tagSeed, 4), source].filter(Boolean))].slice(0, 5);

  // Personal text is private by default; shared public content is internal.
  const sensitivity: Sensitivity = domain === "knowledge" ? "private" : "internal";

  return { type, source, domain, media, title, url: rawUrl, body, note, tags, sensitivity };
}

/** Used by the manual form to derive domain/media from a chosen type + url. */
export function deriveDomainMedia(type: CaptureType, url: string): { domain: Domain; media: Media } {
  const c = classifyShared({ url, source: type.includes("note") ? "notes" : undefined });
  if (url) return { domain: c.domain, media: c.media };
  if (type === "instagram_reel") return { domain: "content", media: "video" };
  if (type === "threads_post") return { domain: "content", media: "text" };
  if (type === "screenshot") return { domain: "reference", media: "image" };
  if (type === "voice_memo") return { domain: "knowledge", media: "audio" };
  if (type === "web_link") return { domain: "reference", media: "article" };
  return { domain: "knowledge", media: "text" };
}
