// API client for the Indigold backend (indigold-api).
// If VITE_API_URL is unset the PWA runs fully standalone on the bundled
// synthetic fixtures (public/data/*.json) — so the Static Site works with or
// without the backend. When set, these helpers talk to the live API.
// Render's `fromService … property: host` injects a full hostname
// (indigold-api.onrender.com). Normalize whatever is provided to an absolute,
// valid https URL. Empty => standalone fixtures mode.
function normalizeApiBase(raw: string): string {
  let v = raw.trim().replace(/\/+$/, "");
  if (!v) return "";
  v = v.replace(/^https?:\/\//, ""); // strip scheme; we re-add https below
  // Guard against a bare Render service name (e.g. "indigold-api") that has no
  // dot — a non-routable host. Expand it to the public *.onrender.com domain.
  if (!v.includes(".") && !v.includes(":")) v = `${v}.onrender.com`;
  return `https://${v}`;
}
const BASE = normalizeApiBase(((import.meta as { env?: Record<string, string> }).env?.VITE_API_URL || ""));

export const apiEnabled = () => BASE !== "";
export const apiBaseUrl = () => BASE;

const TOKEN_KEY = "indigold_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers as Record<string, string>) };
  const tok = getToken();
  if (tok) headers.authorization = `Bearer ${tok}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => req<{ ok: boolean }>("/health"),
  register: (email: string, password: string) => req<{ token: string }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => req<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  captures: () => req<{ items: unknown[] }>("/captures"),
  createCapture: (body: unknown) => req("/captures", { method: "POST", body: JSON.stringify(body) }),
  triage: (id: string) => req(`/captures/${id}/triage`, { method: "POST" }),
  nodes: () => req<{ nodes: unknown[] }>("/nodes"),
  edges: () => req<{ edges: unknown[] }>("/edges"),
  timeline: () => req<{ events: unknown[] }>("/timeline"),
  contextPacks: () => req<{ items: unknown[] }>("/context-packs"),
  assembleContext: (purpose: string) => req("/context-packs", { method: "POST", body: JSON.stringify({ purpose }) }),
  forecast: () => req("/briefs/forecast", { method: "POST", body: JSON.stringify({}) }),
  usage: () => req<{ tokens: number; dailyBudget: number }>("/usage"),
  exportVault: () => req<unknown>("/export"),
};

// ---------------------------------------------------------------------------
// Backend sync (local-first). The Universal Intake Queue lives in the browser;
// when the API is reachable we also push captures so the backend worker runs the
// real enrichment -> graph -> context-pack -> search pipeline. Best-effort: if the
// API is unset/asleep/offline, everything stays local and re-syncs later.
// ---------------------------------------------------------------------------
const DEVICE_KEY = "indigold_device";

// Surfaced to the UI so a failed token mint reports the REAL reason (CORS/network
// vs auth 500 vs missing build URL) instead of a generic "couldn't reach".
let lastSessionErr: string | null = null;
export const lastSessionError = () => lastSessionErr;

/** Ensure we have a bearer token — uses a per-device account so the user never
 *  sees a login screen (keeps the "no forms" UX). Returns false if API is off. */
export async function ensureSession(): Promise<boolean> {
  lastSessionErr = null;
  if (!apiEnabled()) {
    lastSessionErr = "VITE_API_URL is not set in this PWA build";
    return false;
  }
  if (getToken()) return true;
  let creds: { email: string; password: string } | null = null;
  try {
    creds = JSON.parse(localStorage.getItem(DEVICE_KEY) || "null");
  } catch {
    creds = null;
  }
  if (!creds) {
    const rand = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, "");
    creds = { email: `device-${rand.slice(0, 10)}@indigold.local`, password: rand.slice(0, 24) + "Aa1" };
    localStorage.setItem(DEVICE_KEY, JSON.stringify(creds));
  }
  try {
    let r = await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(creds) });
    if (r.status === 409) {
      r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(creds) });
    }
    if (!r.ok) {
      lastSessionErr = `auth HTTP ${r.status} ${r.statusText} @ ${BASE}`;
      return false;
    }
    const j = (await r.json()) as { token?: string };
    if (j.token) {
      setToken(j.token);
      return true;
    }
    lastSessionErr = "auth response had no token";
  } catch (e) {
    // A thrown fetch from a cross-origin POST is almost always a CORS/preflight
    // block or a network/DNS error — distinct from an HTTP error above.
    lastSessionErr = `network/CORS error reaching ${BASE}: ${e instanceof Error ? e.message : "fetch failed"}`;
  }
  return false;
}

interface SyncableCapture {
  type: string;
  source: string;
  title: string;
  user_note?: string;
  body?: string;
  url?: string;
  sensitivity: string;
}

// Map the PWA's richer semantic types to the backend's accepted enum.
const BACKEND_TYPE: Record<string, string> = {
  short_form_video: "instagram_reel",
  long_form_video: "web_link",
  social_post: "threads_post",
  web_resource: "web_link",
  note: "manual_text",
};
const BACKEND_ALLOWED = new Set([
  "apple_note", "instagram_reel", "threads_post", "web_link", "screenshot",
  "voice_memo", "document", "llm_conversation", "manual_text",
]);
function toBackendType(t: string): string {
  if (BACKEND_ALLOWED.has(t)) return t;
  return BACKEND_TYPE[t] || "manual_text";
}

/** Push one capture to the backend (creates a capture -> enqueues worker pipeline). */
export async function syncCaptureToApi(cap: SyncableCapture): Promise<boolean> {
  if (!apiEnabled()) return false;
  if (!getToken() && !(await ensureSession())) return false;
  try {
    const body = {
      type: toBackendType(cap.type),
      source: cap.source,
      title: cap.title,
      note: cap.user_note || cap.body || "",
      url: cap.url || undefined,
      sensitivity: cap.sensitivity,
    };
    const res = await fetch(`${BASE}/captures`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface UploadResult {
  capture: { id: string; type: string; title: string; source: string };
  asset: { id: string; filename: string; mime: string; size_bytes: number; kind: string };
  signed_url: string;
}

/** Upload a shared file's bytes to the authenticated /capture/upload endpoint.
 *  Requires connectivity + an API. Returns the created capture/asset + a signed
 *  URL, or throws (so the caller can fall back to a local file-reference capture). */
export async function uploadFileToApi(
  file: Blob,
  filename: string,
  meta: { title?: string; source?: string; note?: string } = {},
): Promise<UploadResult> {
  if (!apiEnabled()) throw new Error("api_disabled");
  if (!getToken() && !(await ensureSession())) throw new Error("no_session");
  const form = new FormData();
  if (meta.title) form.append("title", meta.title);
  if (meta.source) form.append("source", meta.source);
  if (meta.note) form.append("note", meta.note);
  form.append("file", file, filename); // field name MUST be "file"
  const res = await fetch(`${BASE}/capture/upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${getToken()}` }, // do NOT set content-type; browser sets the multipart boundary
    body: form,
  });
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);
  return (await res.json()) as UploadResult;
}

export interface BackendCapture {
  id: string;
  type: string;
  source: string;
  captured_at: string;
  sensitivity: string;
  processing_status: string;
  status: string;
  title: string;
  note: string;
  url: string | null;
  screenshot_ref: string | null; // asset id for uploaded-file captures
}

/** Live read of the user's captures from the database. Returns [] if the API is
 *  unreachable (caller falls back to the local cache). Ensures a session first. */
export async function fetchCaptures(): Promise<BackendCapture[]> {
  if (!apiEnabled()) return [];
  if (!getToken() && !(await ensureSession())) return [];
  try {
    const res = await fetch(`${BASE}/captures`, { headers: { authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return [];
    const j = (await res.json()) as { items?: BackendCapture[] };
    return j.items ?? [];
  } catch {
    return [];
  }
}

/** Fetch a fresh signed URL for an owned asset (links expire). */
export async function assetSignedUrl(assetId: string): Promise<string | null> {
  if (!apiEnabled() || !getToken()) return null;
  try {
    const res = await fetch(`${BASE}/assets/${assetId}/url`, { headers: { authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return null;
    return ((await res.json()) as { url: string }).url;
  } catch {
    return null;
  }
}

/** Load a resource from the API when enabled, else fall back to a local fixture. */
export async function loadOrFixture<T>(apiCall: () => Promise<T>, fixturePath: string): Promise<T> {
  if (apiEnabled()) {
    try {
      return await apiCall();
    } catch {
      /* fall through to fixtures on API error */
    }
  }
  const res = await fetch(fixturePath);
  return (await res.json()) as T;
}
