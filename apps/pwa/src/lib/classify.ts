// Deterministic, client-side auto-classifier for shared content.
// "I already know what this is." — infers type/source/domain/media/tags/confidence
// from a URL, text, or shared file, with no questions. Local-first stand-in for the
// backend AI enrichment stage; the same shape flows into the graph/context pipeline.
import type { CaptureType, Sensitivity } from "./types";

export type Domain = "content" | "knowledge" | "reference" | "media";
export type Media = "video" | "image" | "article" | "text" | "audio" | "link" | "document";

export const CONFIDENCE_THRESHOLD = 0.5; // below this -> manual fallback form

export interface SharedFile {
  name?: string;
  type?: string;
  size?: number;
}

export interface ShareInput {
  url?: string;
  title?: string;
  text?: string;
  source?: string;
  note?: string;
  files?: SharedFile[];
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
  confidence: number;
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

const looksLikeUrl = (s?: string) => !!s && /^https?:\/\/\S+$/i.test(s.trim());
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

interface HostRule { match: RegExp; type: CaptureType; source: string; domain: Domain; media: Media; }
const HOST_RULES: HostRule[] = [
  { match: /instagram\.com/, type: "instagram_reel", source: "instagram", domain: "content", media: "video" },
  { match: /threads\.(net|com)/, type: "threads_post", source: "threads", domain: "content", media: "text" },
  { match: /(youtube\.com|youtu\.be)/, type: "web_link", source: "youtube", domain: "content", media: "video" },
  { match: /tiktok\.com/, type: "web_link", source: "tiktok", domain: "content", media: "video" },
  { match: /(twitter\.com|x\.com)/, type: "web_link", source: "x", domain: "content", media: "text" },
  { match: /facebook\.com|fb\.watch/, type: "web_link", source: "facebook", domain: "content", media: "link" },
];

function tagsFrom(seed: string, source: string): string[] {
  return [...new Set([...keywords(seed, 4), source].filter(Boolean))].slice(0, 5);
}

function classifyFile(file: SharedFile, input: ShareInput): Classified {
  const mt = (file.type || "").toLowerCase();
  const name = file.name || "shared-file";
  let type: CaptureType, source: string, domain: Domain, media: Media, confidence: number;

  if (mt.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(name)) {
    type = "screenshot"; source = "photos"; domain = "reference"; media = "image"; confidence = 0.9;
  } else if (mt === "application/pdf" || /\.pdf$/i.test(name)) {
    type = "document"; source = "files"; domain = "reference"; media = "document"; confidence = 0.9;
  } else if (mt.startsWith("audio/") || /\.(m4a|mp3|wav|aac)$/i.test(name)) {
    type = "voice_memo"; source = "voice_memos"; domain = "knowledge"; media = "audio"; confidence = 0.9;
  } else if (mt.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(name)) {
    type = "document"; source = "files"; domain = "content"; media = "video"; confidence = 0.8;
  } else if (mt.startsWith("text/") || /\.(txt|md|markdown|rtf)$/i.test(name)) {
    type = "manual_text"; source = "files"; domain = "knowledge"; media = "text"; confidence = 0.75;
  } else if (/\.(docx?|pages|key|pptx?|xlsx?)$/i.test(name)) {
    type = "document"; source = "files"; domain = "reference"; media = "document"; confidence = 0.8;
  } else {
    type = "document"; source = "files"; domain = "reference"; media = "link"; confidence = 0.55;
  }

  const title = (input.title && input.title.trim()) || name;
  return {
    type, source, domain, media, title,
    url: input.url?.trim() || "",
    body: input.text || "",
    note: input.note?.trim() || "",
    tags: tagsFrom(`${name} ${input.title || ""}`, source),
    sensitivity: domain === "knowledge" ? "private" : "internal",
    confidence,
  };
}

export function classifyShared(input: ShareInput): Classified {
  const file = input.files?.find((f) => f && (f.type || f.name));
  if (file) return classifyFile(file, input);

  const rawUrl = input.url?.trim() || (looksLikeUrl(input.text) ? input.text!.trim() : "");
  const host = rawUrl ? hostOf(rawUrl) : "";
  const body = (input.text && input.text.trim() !== rawUrl ? input.text : "") || "";
  const note = input.note?.trim() || "";
  const srcHint = (input.source || "").toLowerCase();

  let type: CaptureType, source: string, domain: Domain, media: Media, confidence: number;

  const rule = host ? HOST_RULES.find((r) => r.match.test(host)) : undefined;
  if (rule) {
    ({ type, source, domain, media } = rule);
    confidence = 0.95;
  } else if (rawUrl) {
    type = "web_link"; source = srcHint || host || "web"; domain = "reference"; media = "article"; confidence = 0.78;
  } else if (/note/.test(srcHint)) {
    type = "apple_note"; source = "apple_notes"; domain = "knowledge"; media = "text"; confidence = 0.85;
  } else if (/chatgpt|claude|assistant|gpt|llm/.test(srcHint)) {
    type = "llm_conversation"; source = srcHint || "assistant_export"; domain = "knowledge"; media = "text"; confidence = 0.85;
  } else if (body) {
    type = "manual_text"; source = srcHint || "manual"; domain = "knowledge"; media = "text"; confidence = 0.6;
  } else {
    type = "manual_text"; source = "manual"; domain = "knowledge"; media = "text"; confidence = 0.3;
  }

  const title =
    (input.title && input.title.trim()) ||
    (body ? body.replace(/\s+/g, " ").trim().slice(0, 60) : "") ||
    (rawUrl ? `${source} · ${host || "link"}` : `${source} capture`);

  return {
    type, source, domain, media, title, url: rawUrl, body, note,
    tags: tagsFrom(`${input.title || ""} ${body} ${host.replace(/\.[a-z]+$/, "")}`, source),
    sensitivity: domain === "knowledge" ? "private" : "internal",
    confidence,
  };
}

/** Used by the manual form to derive domain/media from a chosen type + url. */
export function deriveDomainMedia(type: CaptureType, url: string): { domain: Domain; media: Media } {
  const c = classifyShared({ url, source: type.includes("note") ? "notes" : undefined });
  if (url) return { domain: c.domain, media: c.media };
  if (type === "instagram_reel") return { domain: "content", media: "video" };
  if (type === "threads_post") return { domain: "content", media: "text" };
  if (type === "screenshot") return { domain: "reference", media: "image" };
  if (type === "voice_memo") return { domain: "knowledge", media: "audio" };
  if (type === "document") return { domain: "reference", media: "document" };
  if (type === "web_link") return { domain: "reference", media: "article" };
  return { domain: "knowledge", media: "text" };
}
