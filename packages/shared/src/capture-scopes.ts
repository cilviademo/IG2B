// Capture-token scopes (Security review, Finding A). A capture-only credential may carry only
// these scopes; the API gates each ingest endpoint on the specific scope it needs. Pure helpers
// so scope handling is testable without a DB.
export const CAPTURE_SCOPES = ["capture:text", "capture:file", "capture:status"] as const;
export type CaptureScope = (typeof CAPTURE_SCOPES)[number];
export const DEFAULT_CAPTURE_SCOPES: CaptureScope[] = ["capture:text", "capture:file"];

export const isCaptureScope = (s: string): s is CaptureScope => (CAPTURE_SCOPES as readonly string[]).includes(s);

/** Does a token's scope list grant the needed scope? */
export const tokenHasScope = (scopes: unknown, needed: string): boolean =>
  Array.isArray(scopes) && scopes.includes(needed);

/** Sanitize a requested scope list to known scopes (dedup); empty/invalid → the safe defaults. */
export function normalizeCaptureScopes(req?: unknown): CaptureScope[] {
  const arr = Array.isArray(req) ? req.map(String).filter(isCaptureScope) : [];
  return arr.length ? [...new Set(arr)] : [...DEFAULT_CAPTURE_SCOPES];
}
