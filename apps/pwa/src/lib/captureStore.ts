// Local-only capture store (browser localStorage). No backend, no login, no API.
// This is the first capture-and-review test layer for the PWA.
import { type CaptureType, type Sensitivity, type ProcessingStatus, CAPTURE_TYPE_LABEL } from "./types";
import { deriveDomainMedia } from "./classify";

export interface LocalCapture {
  id: string;
  type: CaptureType;
  title: string;
  source: string;
  url: string;
  body: string;
  user_note: string;
  captured_at: string;
  truth_layer: "A";
  status: "inbox";
  sensitivity: Sensitivity;
  processing_status: ProcessingStatus;
  tags: string[];
  domain?: string;
  media?: string;
  auto_classified?: boolean;
  files?: { name: string; type: string; size: number }[];
  synced?: boolean;
  provenance: { capture_method: string; device: string; app_context: string };
}

const KEY = "indigold_captures_v1";
const EVENT = "indigold:captures-changed";

function read(): LocalCapture[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as LocalCapture[]) : [];
  } catch {
    return [];
  }
}

function write(list: LocalCapture[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function newCaptureId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cap_${Date.now()}_${rand}`;
}

export function detectDevice(): string {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

/** Newest first. */
export function listCaptures(): LocalCapture[] {
  return read().sort((a, b) => (b.captured_at || "").localeCompare(a.captured_at || ""));
}

export function getCapture(id: string): LocalCapture | undefined {
  return read().find((c) => c.id === id);
}

export function saveCapture(c: LocalCapture) {
  const list = read();
  const idx = list.findIndex((x) => x.id === c.id);
  if (idx >= 0) list[idx] = c;
  else list.push(c);
  write(list);
}

/** Build + persist a capture from already-classified fields. Single source of
 *  truth shared by the manual Save button and share-sheet auto-save, so both
 *  produce byte-identical records. Returns null if there's nothing to save. */
export function persistCaptureFromParams(
  p: {
    type: CaptureType;
    title?: string;
    url?: string;
    body?: string;
    source?: string;
    note?: string;
    tags?: string;
    sensitivity?: Sensitivity;
    processing?: ProcessingStatus;
  },
  opts: { method: string; autoClassified: boolean },
): LocalCapture | null {
  const url = (p.url ?? "").trim();
  const body = (p.body ?? "").trim();
  const title = (p.title ?? "").trim();
  if (!title && !body && !url) return null;

  const capture: LocalCapture = {
    id: newCaptureId(),
    type: p.type,
    title: title || (url || `${CAPTURE_TYPE_LABEL[p.type]} capture`),
    source: (p.source ?? "").trim() || "ios_share_sheet",
    url,
    body,
    user_note: (p.note ?? "").trim(),
    captured_at: new Date().toISOString(),
    truth_layer: "A",
    status: "inbox",
    sensitivity: p.sensitivity ?? "internal",
    processing_status: p.processing ?? "unprocessed",
    tags: (p.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    ...deriveDomainMedia(p.type, url),
    auto_classified: opts.autoClassified,
    provenance: { capture_method: opts.method, device: detectDevice(), app_context: "pwa" },
  };
  saveCapture(capture);
  return capture;
}

export function markSynced(id: string) {
  const list = read();
  const idx = list.findIndex((c) => c.id === id);
  if (idx >= 0 && !list[idx].synced) {
    list[idx].synced = true;
    write(list);
  }
}

export function removeCapture(id: string) {
  write(read().filter((c) => c.id !== id));
}

export function exportCaptures(): string {
  return JSON.stringify(
    { app: "Indigold", kind: "captures", version: "0.1.0", exported_at: new Date().toISOString(), captures: read() },
    null,
    2,
  );
}

/** Imports a bundle (or a bare array) of captures. Dedupes by id. */
export function importCaptures(json: string): { added: number; total: number } {
  const parsed = JSON.parse(json);
  const incoming: LocalCapture[] = Array.isArray(parsed) ? parsed : parsed.captures || [];
  if (!Array.isArray(incoming)) throw new Error("No captures array found");
  const list = read();
  const byId = new Map(list.map((c) => [c.id, c]));
  let added = 0;
  for (const c of incoming) {
    if (!c || !c.id || !c.type) continue;
    if (!byId.has(c.id)) added++;
    byId.set(c.id, { ...c, truth_layer: "A", status: "inbox" });
  }
  const merged = [...byId.values()];
  write(merged);
  return { added, total: merged.length };
}

/** Subscribe to changes (same tab via CustomEvent, cross-tab via storage). */
export function subscribeCaptures(cb: () => void): () => void {
  const onEvent = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}
