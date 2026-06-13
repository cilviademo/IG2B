// Offline-safe upload queue for the /capture form path.
//
// A file picked on the manual form is persisted two ways so it is NEVER lost,
// even if the API is asleep/offline at Save time:
//   1. the raw bytes go into IndexedDB ("files" store, via idbShare.putFile)
//   2. a small metadata record goes into this localStorage queue (no blob — the
//      blob lives in IDB and is loaded back on retry).
// flushUploadQueue() drains it (called on Save success and on every Inbox
// refresh). On a successful upload the local capture is marked synced and the
// blob is dropped; on failure the entry stays queued and retries later.

import { getFile, delFile } from "./idbShare";
import { uploadFileToApi } from "./api";
import { markSynced } from "./captureStore";

export interface UploadJob {
  captureId: string; // local capture id (marked synced once uploaded)
  fileKey: string; // IDB "files" key for the blob (e.g. "<captureId>:0")
  filename: string;
  type: string;
  size: number;
  title?: string;
  source?: string;
  note?: string;
  queuedAt: number;
}

const KEY = "indigold_upload_queue_v1";

function read(): UploadJob[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as UploadJob[]) : [];
  } catch {
    return [];
  }
}

function write(list: UploadJob[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function enqueueUpload(job: UploadJob): void {
  const list = read().filter((j) => j.captureId !== job.captureId);
  list.push(job);
  write(list);
}

export function dequeueUpload(captureId: string): void {
  write(read().filter((j) => j.captureId !== captureId));
}

export function uploadQueueLength(): number {
  return read().length;
}

/** Retry every queued upload. Returns counts so the UI can report honest status
 *  (e.g. "2 file(s) uploaded · 1 still queued"). Never throws. */
export async function flushUploadQueue(): Promise<{ uploaded: number; remaining: number }> {
  const jobs = read();
  let uploaded = 0;
  for (const job of jobs) {
    const rec = await getFile(job.fileKey);
    if (!rec) {
      // Blob is gone (storage cleared) — drop the orphaned queue entry.
      dequeueUpload(job.captureId);
      continue;
    }
    try {
      await uploadFileToApi(rec.blob, job.filename, { title: job.title, source: job.source, note: job.note });
      markSynced(job.captureId);
      dequeueUpload(job.captureId);
      await delFile(job.fileKey);
      uploaded++;
    } catch {
      // Still offline / asleep / oversize-on-server — leave it queued for next time.
    }
  }
  return { uploaded, remaining: uploadQueueLength() };
}
