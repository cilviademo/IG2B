// Pure normalization for vault import / restore. Maps a loosely-shaped exported record
// to a safe, fully-defaulted row — no I/O, so it's unit-testable (import-verify) and the
// import route stays thin. Restore is best-effort + tolerant: bad fields fall back to
// safe defaults rather than failing the whole bundle.

export interface NormalizedNode {
  id: string; user_id: string; type: string; title: string; summary: string;
  truth_layer: string; truth_label: string; mvs: number; tags: string[];
}
export function normalizeImportNode(n: Record<string, unknown>, newId: string, userId: string): NormalizedNode {
  return {
    id: newId, user_id: userId,
    type: typeof n.type === "string" ? n.type : "concept",
    title: String(n.title ?? "Untitled"),
    summary: String(n.summary ?? ""),
    truth_layer: typeof n.truth_layer === "string" ? n.truth_layer : "C",
    truth_label: String(n.truth_label ?? "Knowledge"),
    mvs: Number.isFinite(Number(n.mvs)) ? Number(n.mvs) : 50,
    tags: Array.isArray(n.tags) ? (n.tags as unknown[]).map(String) : [],
  };
}

export interface NormalizedCapture {
  id: string; user_id: string; type: string; source: string; captured_at: string;
  truth_layer: "A"; status: string; sensitivity: string; processing_status: string;
  title: string; note: string; url: string | null; screenshot_ref: string | null;
}
/** Captures are Truth Layer A (immutable raw); preserve the original id so a restore
 *  round-trips exactly (and is idempotent on re-import). */
export function normalizeImportCapture(c: Record<string, unknown>, userId: string): NormalizedCapture {
  return {
    id: String(c.id ?? ""),
    user_id: userId,
    type: typeof c.type === "string" ? c.type : "manual_text",
    source: typeof c.source === "string" ? c.source : "import",
    captured_at: typeof c.captured_at === "string" ? c.captured_at : new Date().toISOString(),
    truth_layer: "A",
    status: typeof c.status === "string" ? c.status : "inbox",
    sensitivity: typeof c.sensitivity === "string" ? c.sensitivity : "internal",
    processing_status: typeof c.processing_status === "string" ? c.processing_status : "unprocessed",
    title: String(c.title ?? "Untitled"),
    note: String(c.note ?? ""),
    url: typeof c.url === "string" ? c.url : null,
    screenshot_ref: typeof c.screenshot_ref === "string" ? c.screenshot_ref : null,
  };
}

const TIMELINE_TYPES = new Set(["connection", "discovery", "insight", "project", "architecture", "milestone"]);
const TIMELINE_SIG = new Set(["critical", "high", "medium"]);
export interface NormalizedTimeline {
  id: string; user_id: string; date: string; type: string; significance: string;
  title: string; description: string; node_id: string | null;
}
/** Timeline event restore. `resolveNodeId` remaps the referenced node to its new id
 *  (nodes are re-keyed on import); returns null if it no longer resolves. */
export function normalizeImportTimeline(t: Record<string, unknown>, userId: string, resolveNodeId: (old: string) => string | null): NormalizedTimeline {
  const rawNode = t.node_id != null ? String(t.node_id) : "";
  return {
    id: String(t.id ?? ""),
    user_id: userId,
    date: typeof t.date === "string" ? t.date : new Date().toISOString().slice(0, 10),
    type: typeof t.type === "string" && TIMELINE_TYPES.has(t.type) ? t.type : "milestone",
    significance: typeof t.significance === "string" && TIMELINE_SIG.has(t.significance) ? t.significance : "medium",
    title: String(t.title ?? "Untitled"),
    description: String(t.description ?? ""),
    node_id: rawNode ? resolveNodeId(rawNode) : null,
  };
}
