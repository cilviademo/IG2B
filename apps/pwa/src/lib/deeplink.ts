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
  return out;
}

export function coerceType(t?: string): CaptureType {
  return t && (VALID_TYPES as string[]).includes(t) ? (t as CaptureType) : "manual_text";
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
