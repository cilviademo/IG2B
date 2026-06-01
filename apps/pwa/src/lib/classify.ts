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

// Hostname -> canonical source platform (per the Share Sheet spec).
function detectSource(host: string): string {
  if (/instagram\.com/.test(host)) return "instagram";
  if (/tiktok\.com/.test(host)) return "tiktok";
  if (/youtube\.com|youtu\.be/.test(host)) return "youtube";
  if (/vimeo\.com/.test(host)) return "vimeo";
  if (/reddit\.com/.test(host)) return "reddit";
  if (/threads\.(net|com)/.test(host)) return "threads";
  if (/(^|\.)x\.com|twitter\.com/.test(host)) return "x";
  if (/facebook\.com|fb\.watch/.test(host)) return "facebook";
  if (/linkedin\.com/.test(host)) return "linkedin";
  if (/apple\.com/.test(host)) return "apple";
  return "";
}

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

  const text = input.text || "";
  // Tolerate trailing newlines / surrounding text (e.g. Instagram shares append
  // "\n" or extra words): if the text isn't a bare URL, extract the first URL.
  const rawUrl =
    input.url?.trim() ||
    (looksLikeUrl(text) ? text.trim() : (text.match(/https?:\/\/\S+/i)?.[0] ?? ""));
  const host = rawUrl ? hostOf(rawUrl) : "";
  const body = (text && text.trim() !== rawUrl ? text : "") || "";
  const note = input.note?.trim() || "";
  const srcHint = (input.source || "").toLowerCase();

  let type: CaptureType, source: string, domain: Domain, media: Media, confidence: number;

  const path = (() => {
    try {
      return new URL(rawUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const u = host + path;

  if (rawUrl) {
    // Host detection wins; the shortcut's `source` hint is only a fallback.
    source = detectSource(host) || srcHint || "ios_share_sheet";
    if (/instagram\.com\/reel/.test(u) || /tiktok\.com/.test(host) || /youtube\.com\/shorts/.test(u) || /facebook\.com\/reel/.test(u)) {
      type = "short_form_video"; domain = "content"; media = "video"; confidence = 0.95;
    } else if (/youtube\.com\/watch/.test(u) || /youtu\.be/.test(host) || /vimeo\.com/.test(host)) {
      type = "long_form_video"; domain = "content"; media = "video"; confidence = 0.95;
    } else if (/threads\.(net|com)|(^|\.)x\.com|twitter\.com|reddit\.com|facebook\.com|linkedin\.com/.test(host)) {
      type = "social_post"; domain = "content"; media = "text"; confidence = 0.9;
    } else {
      type = "web_resource"; domain = "reference"; media = "article"; confidence = 0.8;
    }
  } else if (/note/.test(srcHint)) {
    type = "note"; source = "apple"; domain = "knowledge"; media = "text"; confidence = 0.85;
  } else if (/chatgpt|claude|assistant|gpt|llm/.test(srcHint)) {
    type = "llm_conversation"; source = srcHint || "assistant_export"; domain = "knowledge"; media = "text"; confidence = 0.85;
  } else if (body) {
    type = "note"; source = srcHint || "ios_share_sheet"; domain = "knowledge"; media = "text"; confidence = 0.7;
  } else {
    type = "note"; source = "manual"; domain = "knowledge"; media = "text"; confidence = 0.3;
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
  if (type === "instagram_reel" || type === "short_form_video" || type === "long_form_video") return { domain: "content", media: "video" };
  if (type === "threads_post" || type === "social_post") return { domain: "content", media: "text" };
  if (type === "screenshot") return { domain: "reference", media: "image" };
  if (type === "voice_memo") return { domain: "knowledge", media: "audio" };
  if (type === "document") return { domain: "reference", media: "document" };
  if (type === "web_link" || type === "web_resource") return { domain: "reference", media: "article" };
  return { domain: "knowledge", media: "text" };
}
