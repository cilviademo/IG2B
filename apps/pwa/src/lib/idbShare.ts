// IndexedDB bridge for Web Share Target POST payloads (incl. files).
// The service worker writes the shared payload into the "pending" store and
// redirects to /share?pending=<id>; this module reads it back in the app.
// Schema MUST match the inline IDB code in public/sw.js.

const DB = "indigold-share";
const VERSION = 1;

export interface PendingFile {
  name: string;
  type: string;
  size: number;
  blob: Blob;
}
export interface PendingShare {
  id: string;
  title: string;
  text: string;
  url: string;
  files: PendingFile[];
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export async function getPending(id: string): Promise<PendingShare | null> {
  try {
    const v = await tx<PendingShare>("pending", "readonly", (s) => s.get(id) as IDBRequest<PendingShare>);
    return v || null;
  } catch {
    return null;
  }
}

export async function delPending(id: string): Promise<void> {
  try {
    await tx("pending", "readwrite", (s) => s.delete(id) as unknown as IDBRequest<void>);
  } catch {
    /* ignore */
  }
}

/** Persist a captured file blob locally (keyed by captureId:index) for later
 *  preview/upload. Best-effort. */
export async function putFile(id: string, rec: { name: string; type: string; size: number; blob: Blob }): Promise<void> {
  try {
    await tx("files", "readwrite", (s) => s.put({ id, ...rec }) as unknown as IDBRequest<void>);
  } catch {
    /* ignore */
  }
}

/** Read a previously-persisted file blob back (for a queued upload retry). */
export async function getFile(id: string): Promise<{ name: string; type: string; size: number; blob: Blob } | null> {
  try {
    const v = await tx<{ name: string; type: string; size: number; blob: Blob }>(
      "files",
      "readonly",
      (s) => s.get(id) as IDBRequest<{ name: string; type: string; size: number; blob: Blob }>,
    );
    return v && v.blob ? v : null;
  } catch {
    return null;
  }
}

/** Drop a persisted file blob once it's been uploaded (frees device storage). */
export async function delFile(id: string): Promise<void> {
  try {
    await tx("files", "readwrite", (s) => s.delete(id) as unknown as IDBRequest<void>);
  } catch {
    /* ignore */
  }
}
