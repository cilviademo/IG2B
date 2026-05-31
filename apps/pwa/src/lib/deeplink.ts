// Deep-link helpers for /capture?type=…&title=…&url=…&body=…&source=…&note=…&tags=…
// Used by the /capture route (Apple Shortcuts / Share Sheet entry point) and the
// in-app "Copy Deep Link" / "Generate Shortcut URL" test buttons.
import type { CaptureType } from "./types";

const VALID_TYPES: CaptureType[] = [
  "apple_note",
  "instagram_reel",
  "threads_post",
  "web_link",
  "screenshot",
  "voice_memo",
  "manual_text",
  "llm_conversation",
];

export interface CaptureParams {
  type?: string;
  title?: string;
  url?: string;
  body?: string;
  source?: string;
  note?: string;
  tags?: string;
}

const KEYS = ["type", "title", "url", "body", "source", "note", "tags"] as const;

export function parseCaptureParams(search: string): CaptureParams {
  const q = new URLSearchParams(search);
  const out: CaptureParams = {};
  for (const k of KEYS) {
    const v = q.get(k);
    if (v != null) out[k] = v;
  }
  // Accept the Apple Shortcut param names: `content` / `text` alias `body`.
  if (out.body == null) {
    const alt = q.get("content") ?? q.get("text");
    if (alt != null) out.body = alt;
  }
  return out;
}

// Friendly type aliases the shortcut (or anyone) may send -> canonical CaptureType.
const TYPE_ALIASES: Record<string, CaptureType> = {
  "short-form-video": "instagram_reel",
  "short_form_video": "instagram_reel",
  reel: "instagram_reel",
  video: "instagram_reel",
  note: "apple_note",
  "apple-note": "apple_note",
  "web-resource": "web_link",
  "web_resource": "web_link",
  article: "web_link",
  link: "web_link",
  url: "web_link",
  thread: "threads_post",
  "threads-post": "threads_post",
  image: "screenshot",
  photo: "screenshot",
  screenshot: "screenshot",
  audio: "voice_memo",
  voice: "voice_memo",
  "voice-memo": "voice_memo",
  conversation: "llm_conversation",
  llm: "llm_conversation",
  chat: "llm_conversation",
  document: "document",
  pdf: "document",
  text: "manual_text",
  manual: "manual_text",
};

/** Map a raw/aliased type string to a canonical CaptureType, or undefined. */
export function normalizeType(t?: string): CaptureType | undefined {
  if (!t) return undefined;
  const k = t.trim().toLowerCase();
  if ((VALID_TYPES as string[]).includes(k)) return k as CaptureType;
  return TYPE_ALIASES[k];
}

export function coerceType(t?: string): CaptureType {
  return normalizeType(t) ?? "manual_text";
}

export function hasAnyParams(p: CaptureParams): boolean {
  return KEYS.some((k) => p[k] != null && p[k] !== "");
}

/** Build a working deep link from field values (omits empty fields). */
export function buildDeepLink(origin: string, f: CaptureParams): string {
  const q = new URLSearchParams();
  for (const k of KEYS) {
    const v = f[k];
    if (v) q.set(k, v);
  }
  const qs = q.toString();
  return `${origin}/capture${qs ? "?" + qs : ""}`;
}

/** An Apple Shortcuts URL template — replace the [Bracketed] tokens with magic
 *  variables (e.g. Shortcut Input, Ask Each Time) in the Shortcuts editor. */
export function buildShortcutTemplate(origin: string): string {
  return `${origin}/capture?type=web_link&title=[Title]&url=[Shortcut Input]&note=[Note]&tags=[Tags]`;
}
