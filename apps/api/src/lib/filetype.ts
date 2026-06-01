// Auto-categorize an uploaded file (by MIME, with filename-extension fallback)
// into the backend capture `type` enum + a human title hint.
const BACKEND_TYPES = new Set([
  "apple_note", "instagram_reel", "threads_post", "web_link", "screenshot",
  "voice_memo", "document", "llm_conversation", "manual_text",
]);

export interface FileClass {
  type: string; // a value in BACKEND_TYPES
  kind: "image" | "document" | "video" | "audio" | "other";
}

export function classifyFile(mime: string, filename: string): FileClass {
  const mt = (mime || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  const ext = (m: RegExp) => m.test(name);

  if (mt.startsWith("image/") || ext(/\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/))
    return { type: "screenshot", kind: "image" }; // image/screenshot -> Image
  if (mt === "application/pdf" || ext(/\.pdf$/))
    return { type: "document", kind: "document" };
  if (mt.startsWith("audio/") || ext(/\.(m4a|mp3|wav|aac|aiff?|flac)$/))
    return { type: "voice_memo", kind: "audio" };
  if (mt.startsWith("video/") || ext(/\.(mp4|mov|webm|m4v|avi|mkv)$/))
    return { type: "instagram_reel", kind: "video" }; // video -> Short Video on the PWA
  if (mt.startsWith("text/") || ext(/\.(md|markdown|txt|rtf|csv|json)$/))
    return { type: "manual_text", kind: "document" }; // .md/.txt -> Document-ish text
  if (ext(/\.(docx?|pages|key|pptx?|xlsx?|odt)$/))
    return { type: "document", kind: "document" };

  return { type: "document", kind: "other" };
}

export function isBackendType(t: string): boolean {
  return BACKEND_TYPES.has(t);
}
