// Local-only capture store (browser localStorage). No backend, no login, no API.
// This is the first capture-and-review test layer for the PWA.
import type { CaptureType, Sensitivity, ProcessingStatus } from "./types";

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
