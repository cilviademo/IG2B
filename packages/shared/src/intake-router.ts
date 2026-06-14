// Wave 6 — Universal Intake Router. Deterministic-first: "the Shortcut delivers, Indigold
// decides." Given what was shared (url/mime/filename/text), detect the kind and choose the
// SAFEST processing path + an honest degradation order. Pure (no I/O) so it's fully testable
// and mirrors to the PWA. The worker executes the chosen pipeline; this only decides.

export type IntakeKind =
  | "text" | "note" | "url" | "article" | "pdf" | "image" | "screenshot"
  | "audio" | "voice_memo" | "video"
  | "youtube" | "podcast" | "reel" | "tiktok" | "facebook" | "twitter" | "reddit" | "vimeo";

export type IntakePipeline =
  | "text"            // classify + synthesize from the text itself (existing ingest)
  | "url"             // safe metadata fetch + classify + optional research
  | "captions"        // captions/transcript-first (YouTube/Vimeo); else degrade
  | "transcribe"      // download/normalize audio + Whisper (media worker, Stage 2)
  | "document"        // PDF → text extract → classify
  | "vision"          // image/screenshot → OCR/scene (Stage 7, optional/flagged)
  | "metadata_only";  // honest: link + title/thumbnail; offer manual upload

export interface IntakePlan {
  kind: IntakeKind;
  platform?: string;
  pipeline: IntakePipeline;
  externalFetch: boolean;   // does this path fetch a remote URL? (→ SSRF guard required)
  needsTranscription: boolean;
  advancedOnly: boolean;    // requires opt-in yt-dlp advanced mode (else degrade)
  degradeTo: IntakePipeline; // honest fallback if the primary path can't run
  note: string;             // human-readable, shown in the UI
}

const HOST_KIND: { test: RegExp; kind: IntakeKind; platform: string }[] = [
  { test: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, kind: "youtube", platform: "YouTube" },
  { test: /(^|\.)vimeo\.com$/, kind: "vimeo", platform: "Vimeo" },
  { test: /(^|\.)tiktok\.com$/, kind: "tiktok", platform: "TikTok" },
  { test: /(^|\.)instagram\.com$/, kind: "reel", platform: "Instagram" },
  { test: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/, kind: "facebook", platform: "Facebook" },
  { test: /(^|\.)(twitter|x)\.com$/, kind: "twitter", platform: "X" },
  { test: /(^|\.)reddit\.com$/, kind: "reddit", platform: "Reddit" },
];

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus|aiff?)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i;

export interface IntakeInput { url?: string | null; mime?: string | null; filename?: string | null; text?: string | null; source?: string | null; captureType?: string | null }

// The existing CaptureType is the most reliable signal when present (the Shortcut sets it).
const CAPTURE_KIND: Record<string, IntakeKind> = {
  instagram_reel: "reel", voice_memo: "voice_memo", screenshot: "screenshot", document: "pdf",
};

/** Detect the intake kind from whatever the share delivered. */
export function detectIntake(i: IntakeInput): { kind: IntakeKind; platform?: string } {
  // Definitive capture types win (but a web_link still gets URL-host refinement below).
  const ct = (i.captureType || "").toLowerCase();
  if (CAPTURE_KIND[ct]) return { kind: CAPTURE_KIND[ct], platform: ct === "instagram_reel" ? "Instagram" : undefined };
  const mime = (i.mime || "").toLowerCase();
  const name = (i.filename || "").toLowerCase();
  const url = (i.url || "").trim();

  // Uploaded files (mime/extension win — most reliable).
  if (mime.startsWith("audio/") || AUDIO_EXT.test(name)) return { kind: /voice|memo|recording/i.test(name + (i.source || "")) ? "voice_memo" : "audio" };
  if (mime.startsWith("video/") || VIDEO_EXT.test(name)) return { kind: "video" };
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return { kind: "pdf" };
  if (mime.startsWith("image/") || IMAGE_EXT.test(name)) return { kind: /screenshot|screen shot|screen_shot/i.test(name + (i.source || "")) ? "screenshot" : "image" };

  // URL by host.
  if (url) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { /* not a URL */ }
    if (host) {
      const m = HOST_KIND.find((h) => h.test.test(host));
      if (m) return { kind: m.kind, platform: m.platform };
      if (/\.(mp3|m4a|wav)$/i.test(url)) return { kind: "podcast" };
      if (/\/podcast|\/episode|feeds?\.|\.rss$|\/feed/i.test(url)) return { kind: "podcast" };
      // Heuristic: long-form article hosts vs. bare link.
      return { kind: /\/(20\d\d|article|blog|post|p)\//i.test(url) ? "article" : "url" };
    }
  }
  // Pure text/note.
  return { kind: i.text && i.text.length > 280 ? "note" : "text" };
}

/** Choose the safest pipeline + honest degradation for a detected kind.
 *  `advancedEnabled` = the owner has opted into domain-limited yt-dlp extraction. */
export function planIntake(i: IntakeInput, advancedEnabled = false): IntakePlan {
  const { kind, platform } = detectIntake(i);
  const base = { kind, platform } as Pick<IntakePlan, "kind" | "platform">;
  switch (kind) {
    case "text": case "note":
      return { ...base, pipeline: "text", externalFetch: false, needsTranscription: false, advancedOnly: false, degradeTo: "text", note: "Classify + synthesize from the text." };
    case "url": case "article": case "reddit": case "twitter":
      return { ...base, pipeline: "url", externalFetch: true, needsTranscription: false, advancedOnly: false, degradeTo: "metadata_only", note: "Fetch metadata safely, classify, link." };
    case "pdf":
      return { ...base, pipeline: "document", externalFetch: false, needsTranscription: false, advancedOnly: false, degradeTo: "metadata_only", note: "Extract text from the PDF, then classify." };
    case "image": case "screenshot":
      return { ...base, pipeline: "vision", externalFetch: false, needsTranscription: false, advancedOnly: false, degradeTo: "metadata_only", note: "Vision/OCR (optional, flagged) — else stored as image." };
    case "youtube": case "vimeo":
      // Captions-first (free, no transcription). Degrade to metadata if none.
      return { ...base, pipeline: "captions", externalFetch: true, needsTranscription: false, advancedOnly: false, degradeTo: "metadata_only", note: "Captions/transcript first; metadata if unavailable." };
    case "audio": case "voice_memo": case "video": case "podcast":
      // Uploaded/remote media → normalize + Whisper on the media worker.
      return { ...base, pipeline: "transcribe", externalFetch: kind === "podcast", needsTranscription: true, advancedOnly: false, degradeTo: "metadata_only", note: "Normalize audio + transcribe (media worker)." };
    case "reel": case "tiktok": case "facebook":
      // NEVER scrape by default. Metadata only, unless advanced opt-in for that domain.
      return { ...base, pipeline: advancedEnabled ? "transcribe" : "metadata_only", externalFetch: true, needsTranscription: advancedEnabled, advancedOnly: true, degradeTo: "metadata_only", note: advancedEnabled ? "Advanced extraction (opt-in); degrades honestly if blocked." : "Link + title/thumbnail; offer to upload a screen recording." };
    default:
      return { ...base, pipeline: "metadata_only", externalFetch: false, needsTranscription: false, advancedOnly: false, degradeTo: "metadata_only", note: "Stored as a link." };
  }
}

// Honest preference order (UI + handler follow this top-down).
export const DEGRADATION_ORDER: IntakePipeline[] = ["transcribe", "captions", "url", "document", "vision", "metadata_only"];

/** Strip a WebVTT/SRT subtitle file to plain spoken text. Pure (testable); used by the
 *  media-worker's captions-first path. Drops headers/timing cues/indices, inline tags and
 *  entities, and collapses the adjacent-duplicate lines auto-captions emit. */
export function subtitleToText(sub: string): string {
  const out: string[] = [];
  for (const raw of sub.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "WEBVTT" || line.startsWith("NOTE") || line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    if (/^\d+$/.test(line)) continue; // SRT cue index
    if (/-->/.test(line)) continue; // timing cue
    const clean = line.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (out[out.length - 1] !== clean) out.push(clean);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}
