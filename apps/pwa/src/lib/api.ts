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
  const explicit = v.match(/^(https?):\/\//)?.[1]; // honor an explicit scheme
  v = v.replace(/^https?:\/\//, "");
  // Guard against a bare Render service name (e.g. "indigold-api") that has no
  // dot — a non-routable host. Expand it to the public *.onrender.com domain.
  if (!v.includes(".") && !v.includes(":")) v = `${v}.onrender.com`;
  // Scheme: keep what was given; default localhost to http, everything else https.
  const scheme = explicit || (/^localhost(:|$)|^127\.0\.0\.1(:|$)/.test(v) ? "http" : "https");
  return `${scheme}://${v}`;
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
const CLAIMED_KEY = "indigold_account_email"; // set when a real login/claim succeeds (token-only)

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

export interface AccountResult { ok: boolean; email?: string; error?: string }

/** Best-effort read of a response body for auth debugging (server error code/message). */
async function bodyText(res: Response): Promise<string> {
  try {
    const t = (await res.clone().text()).slice(0, 200);
    return t ? `· ${t}` : "";
  } catch {
    return "";
  }
}

/** Claim the CURRENT vault: set a real email+password on this account so its data
 *  is preserved AND it's recoverable by login on any surface / after a reinstall.
 *  TOKEN-ONLY: the password is NOT persisted (security) — re-login restores after a
 *  token loss (iCloud Keychain autofills). */
export async function claimAccount(email: string, password: string): Promise<AccountResult> {
  if (!apiEnabled()) return { ok: false, error: "API not configured (VITE_API_URL unset)." };
  if (!getToken() && !(await ensureSession())) return { ok: false, error: lastSessionError() || "no session" };
  try {
    const res = await fetch(`${BASE}/auth/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 409) return { ok: false, error: "That email is already in use by another account. Use “Log in” to sign into it instead." };
    if (res.status === 400) return { ok: false, error: "Use a valid email + a password of at least 8 characters." };
    if (!res.ok) return { ok: false, error: `claim failed — HTTP ${res.status} ${await bodyText(res)}` };
    const j = (await res.json()) as { token?: string };
    if (j.token) setToken(j.token);
    // Persist creds so the silent session can re-auth to THIS account (restores the
    // working login flow; the anonymous fallback also relies on this).
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ email, password }));
    localStorage.setItem(CLAIMED_KEY, email);
    return { ok: true, email };
  } catch (e) {
    return { ok: false, error: `network/CORS: ${e instanceof Error ? e.message : "fetch failed"}` };
  }
}

/** Log in to an existing vault (e.g. after a reinstall, or on a second surface).
 *  TOKEN-ONLY — the password is never written to localStorage. */
export async function loginAccount(email: string, password: string): Promise<AccountResult> {
  if (!apiEnabled()) return { ok: false, error: "API not configured (VITE_API_URL unset)." };
  try {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 401) return { ok: false, error: "Wrong email or password (server: invalid_credentials). Check caps/spaces; if you never set a password, use “Secure this vault” instead." };
    if (!res.ok) return { ok: false, error: `login failed — HTTP ${res.status} ${await bodyText(res)}` };
    const j = (await res.json()) as { token?: string };
    if (!j.token) return { ok: false, error: "login response had no token" };
    setToken(j.token);
    // Persist creds so the silent session re-auths to this account after a token loss.
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ email, password }));
    localStorage.setItem(CLAIMED_KEY, email);
    return { ok: true, email };
  } catch (e) {
    return { ok: false, error: `network/CORS: ${e instanceof Error ? e.message : "fetch failed"}` };
  }
}

/** Sign out: drop the token + stored creds. Next launch mints a fresh anonymous
 *  account (until the owner logs back in). */
export function logoutAccount(): void {
  clearToken();
  localStorage.removeItem(DEVICE_KEY);
  localStorage.removeItem(CLAIMED_KEY);
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

// Surfaced to the UI so a failed capture sync reports the REAL reason (HTTP
// status / CORS) instead of silently falling back to local-only.
let lastSyncErr: string | null = null;
export const lastSyncError = () => lastSyncErr;

/** Push one capture to the backend (creates a capture -> enqueues worker pipeline).
 *  Auto-recovers a stale/evicted session (401 -> re-mint -> retry once). */
export type ChatMode = "auto" | "vault" | "general" | "web" | "research";
export interface ChatReply {
  answer: string;
  mode: Exclude<ChatMode, "auto">;
  grounding: "vault" | "mixed" | "general";
  deterministic: boolean;
  usedWeb: boolean;
  webNote?: string;
  sources: { id?: string; title: string; url?: string }[];
}
/** Ask Radian anything with a brain mode (Auto/Vault/General/Web/Research) + short history. */
export async function chatRadian(question: string, mode: ChatMode = "auto", history: { role: string; text: string }[] = []): Promise<ChatReply | null> {
  if (!apiEnabled()) return null;
  if (!getToken() && !(await ensureSession())) return null;
  try {
    const res = await fetch(`${BASE}/radian/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ question, mode, history }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ChatReply;
  } catch {
    return null;
  }
}

/** Persist a Radian answer to the vault (capture → ingest pipeline). */
export async function rememberRadian(question: string, answer: string): Promise<boolean> {
  if (!apiEnabled() || (!getToken() && !(await ensureSession()))) return false;
  try {
    const res = await fetch(`${BASE}/radian/remember`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ question, answer }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncCaptureToApi(cap: SyncableCapture): Promise<boolean> {
  lastSyncErr = null;
  if (!apiEnabled()) {
    lastSyncErr = "VITE_API_URL not set";
    return false;
  }
  if (!getToken() && !(await ensureSession())) {
    lastSyncErr = lastSessionError() || "no session";
    return false;
  }
  const body = JSON.stringify({
    type: toBackendType(cap.type),
    source: cap.source,
    title: cap.title,
    note: cap.user_note || cap.body || "",
    url: cap.url || undefined,
    sensitivity: cap.sensitivity,
  });
  const post = () =>
    fetch(`${BASE}/captures`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
      body,
    });
  try {
    let res = await post();
    // A cached token can be stale (Redis LRU eviction / TTL). Re-mint once.
    if (res.status === 401) {
      clearToken();
      if (await ensureSession()) res = await post();
    }
    if (!res.ok) {
      lastSyncErr = `captures HTTP ${res.status} ${res.statusText}`;
      return false;
    }
    return true;
  } catch (e) {
    lastSyncErr = `network/CORS reaching ${BASE}/captures: ${e instanceof Error ? e.message : "fetch failed"}`;
    return false;
  }
}

// Mirror of the server's UPLOAD_MAX_BYTES default (apps/api/src/routes/upload.ts).
// The server is authoritative (it may be raised via env), but a client-side
// pre-check avoids uploading a doomed 50 MB+ file over a phone connection.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

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
  const send = () =>
    fetch(`${BASE}/capture/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` }, // no content-type; browser sets the multipart boundary
      body: form,
    });
  let res = await send();
  if (res.status === 401) {
    // stale/evicted session -> re-mint once and retry
    clearToken();
    if (await ensureSession()) res = await send();
  }
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
/** Live read of the user's captures. Returns the array on success, or NULL on
 *  failure (unreachable / cold-start miss / auth) so callers can keep the last
 *  good data instead of blanking the view. Re-mints once on 401. */
export async function fetchCaptures(): Promise<BackendCapture[] | null> {
  if (!apiEnabled()) return null;
  if (!getToken() && !(await ensureSession())) return null;
  const get = () => fetch(`${BASE}/captures`, { headers: { authorization: `Bearer ${getToken()}` } });
  try {
    let res = await get();
    if (res.status === 401) {
      clearToken();
      if (await ensureSession()) res = await get();
    }
    if (!res.ok) return null;
    const j = (await res.json()) as { items?: BackendCapture[] };
    return j.items ?? [];
  } catch {
    return null;
  }
}

/** Item management — soft-archive (reversible) and permanent delete for a backend capture. */
export async function archiveCapture(id: string): Promise<boolean> {
  if (!apiEnabled() || !getToken()) return false;
  try { return (await fetch(`${BASE}/captures/${id}/archive`, { method: "POST", headers: { authorization: `Bearer ${getToken()}` } })).ok; } catch { return false; }
}
export async function deleteCapture(id: string): Promise<boolean> {
  if (!apiEnabled() || !getToken()) return false;
  try { return (await fetch(`${BASE}/captures/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${getToken()}` } })).ok; } catch { return false; }
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

export interface LlmStatus {
  default_provider: string;
  mode: string;
  providers: Record<string, { configured: boolean; reason?: string }>;
  budget: {
    monthly_budget_cents: number;
    month_to_date_cents: number;
    state: string;
    by_purpose?: { purpose: string; cents: number; calls: number }[];
  };
}

/** Safe LLM provider + budget status for the I/O panel. Never contains secrets. */
export async function fetchLlmStatus(): Promise<LlmStatus | null> {
  if (!apiEnabled()) return null;
  if (!getToken() && !(await ensureSession())) return null;
  try {
    const res = await fetch(`${BASE}/llm/status`, { headers: { authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return null;
    return (await res.json()) as LlmStatus;
  } catch {
    return null;
  }
}

export interface Observability {
  queue: { depth: number; redis: string };
  db: string;
  jobs: { status: string; count: number }[];
  problems: { id: string; type: string; status: string; error: string | null; updated_at: string }[];
  budget: { state: string; month_to_date_cents: number; monthly_budget_cents: number; by_purpose?: { purpose: string; cost_cents: number; calls: number }[] };
  providers: { mode: string; default_provider: string; providers: Record<string, { configured: boolean }> };
  embeddings: { provider: string; model: string; embedded: number; active: boolean };
  pgvector: { available: boolean; version?: string };
  generated_at: string;
}

export interface AiUsage {
  mode: string;
  provider: string;
  key_detected: boolean;
  active_model: string;
  today: { calls: number; input_tokens: number; output_tokens: number; cost_cents: number };
  month: { calls: number; input_tokens: number; output_tokens: number; cost_cents: number };
  budget: { monthly_budget_cents: number; month_to_date_cents: number; remaining_cents: number; pct: number; state: string };
  by_feature: { feature: string; cost_cents: number; calls: number }[];
  recent: { feature: string; purpose: string; provider: string; model: string; input_tokens: number; output_tokens: number; cost_cents: number; status: string; latency_ms: number; source_id: string | null; created_at: string }[];
  generated_at: string;
}

/** AI Usage / Token Observatory — cost ledger aggregate. Metadata only, never a secret. */
export async function fetchAiUsage(): Promise<AiUsage | null> {
  if (!apiEnabled()) return null;
  if (!getToken() && !(await ensureSession())) return null;
  try {
    const res = await fetch(`${BASE}/radian/usage`, { headers: { authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return null;
    return (await res.json()) as AiUsage;
  } catch {
    return null;
  }
}

/** Phase 5 Debug Console — operational status only, never a secret. */
export async function fetchObservability(): Promise<Observability | null> {
  if (!apiEnabled()) return null;
  if (!getToken() && !(await ensureSession())) return null;
  try {
    const res = await fetch(`${BASE}/radian/observability`, { headers: { authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return null;
    return (await res.json()) as Observability;
  } catch {
    return null;
  }
}

// ---- Living OS G1: Companion Panel ("Ask Radian"). The frontend NEVER calls a
// model directly — it asks the governed backend, which enqueues an existing job and
// returns state we poll honestly. ----
export interface AskResult { mode: "job" | "done"; job?: string; task?: string; verb?: string }
export async function askRadian(subjectType: string, subjectId: string, verb: string, question?: string): Promise<AskResult | null> {
  if (!apiEnabled()) return null;
  if (!getToken() && !(await ensureSession())) return null;
  try {
    const res = await fetch(`${BASE}/radian/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, verb, question }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AskResult;
  } catch {
    return null;
  }
}

export interface JobState { id: string; type: string; status: string; result?: unknown; error?: string | null }
export async function getJob(id: string): Promise<JobState | null> {
  if (!apiEnabled() || !getToken()) return null;
  try {
    const res = await fetch(`${BASE}/radian/job/${id}`, { headers: { authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return null;
    return (await res.json()) as JobState;
  } catch {
    return null;
  }
}

// G2 Time Machine — fetch the deterministic replay from the live API (when reachable).
// Returns null when standalone/offline so the page falls back to local computation over
// the bundled data. No model dependency either way.
export async function getTimeMachine(range: string, days?: number): Promise<unknown | null> {
  if (!apiEnabled() || !getToken()) return null;
  try {
    const q = `range=${encodeURIComponent(range)}${days ? `&days=${days}` : ""}`;
    const res = await fetch(`${BASE}/radian/time-machine?${q}`, { headers: { authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// G3 Quests / Actions — all deterministic backend; the frontend just drives state.
export interface Quest {
  id: string; title: string; summary: string; kind: string; state: string;
  source_type: string; source_id?: string | null; node_id?: string | null; project_id?: string | null;
  snooze_until?: string | null; updated_at?: string;
}
async function questReq<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!apiEnabled() || (!getToken() && !(await ensureSession()))) return null;
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}`, ...(init?.headers as Record<string, string>) } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}
// G5 Boardroom — synchronous, deterministic multi-agent council. No polling needed.
export interface BoardroomLine { persona: string; name: string; role: string; color: string; line: string }
export interface BoardroomSynthesis { subject: string; question?: string; lines: BoardroomLine[]; resolved: string; resolvedAction: string; bootstrap: boolean }
export const conveneBoardroom = (subjectType: string, subjectId: string, question?: string) =>
  questReq<{ synthesis: BoardroomSynthesis; node: string }>(`/radian/boardroom`, { method: "POST", body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, question }) });

// G6 Research Engine — horizon scan (deterministic research directions).
export interface HorizonDirection { domain: string; topic: string; rationale: string; sourceType: string; priority: "high" | "med" | "low"; project_id?: string }
export const getHorizon = () => questReq<{ horizon: { payload: { directions: HorizonDirection[]; scanned_at: string } } | null; chain: string[] }>(`/radian/horizon`);
export const runHorizonScan = () => questReq<{ directions: HorizonDirection[]; quests_created: number; chain: string[] }>(`/radian/horizon-scan`, { method: "POST", body: "{}" });

// G7 Simulation — synchronous deterministic "what happens if…?".
export interface SimOutcome { band: "best" | "likely" | "worst"; probability: number; summary: string }
export interface SimOption { name: string; score: number; outcomes: SimOutcome[]; rationale: string }
export interface SimulationResult { question: string; kind: "scenario" | "comparison"; outcomes?: SimOutcome[]; options?: SimOption[]; recommendation: string; assumptions: string[]; confidence: number; estimate: boolean; bootstrap: boolean }
export const runWhatIf = (question: string, options?: string[]) =>
  questReq<{ result: SimulationResult; node: string }>(`/radian/whatif`, { method: "POST", body: JSON.stringify({ question, options }) });

// G9 Mentor Mode — "talk with past you" (deterministic; voiced from real history).
export interface MentorReply { intent: string; voice: string; answer: string; points: string[]; suggestion?: string; bootstrap: boolean }
export const askMentor = (intent: string, range?: number) =>
  questReq<{ reply: MentorReply }>(`/radian/mentor`, { method: "POST", body: JSON.stringify({ intent, range }) });

// G10 Companion — the spoken commander's briefing (deterministic).
export interface CompanionBriefing { greeting: string; lines: string[]; focus: string[]; speech: string; bootstrap: boolean }
export const getBriefing = () => questReq<{ briefing: CompanionBriefing }>(`/radian/briefing`);

// G11 Context Engineering — goal-scoped, token-budgeted retrieval.
export interface ContextItem { id: string; kind: string; title: string; score: number; reasons: string[]; tokens: number }
export interface ContextPlan { goal: string; budget: number; tokensUsed: number; included: ContextItem[]; excludedCount: number; sections: { kind: string; items: { id: string; title: string }[] }[]; bootstrap: boolean }
export const buildContext = (goal: string, budget?: number) =>
  questReq<{ pack: string; plan: ContextPlan; semantic_provider: string }>(`/radian/context`, { method: "POST", body: JSON.stringify({ goal, budget }) });

export const getLiveNodes = () => questReq<{ nodes: unknown[] }>(`/nodes`);
export const getLiveEdges = () => questReq<{ edges: unknown[] }>(`/edges`);
export const getQuestNodeStatus = () => questReq<{ active: string[]; completed: string[] }>(`/radian/quests/node-status`);
export const getProgression = (range?: number) => questReq<unknown>(`/radian/progression${range ? `?range=${range}` : ""}`);
export const getQuests = (states?: string) => questReq<{ items: Quest[] }>(`/radian/quests${states ? `?state=${encodeURIComponent(states)}` : ""}`);
export const getQuestNodeIds = () => questReq<{ node_ids: string[] }>(`/radian/quests/node-ids`);
export const suggestQuests = () => questReq<{ created: number; items: Quest[] }>(`/radian/quests/suggest`, { method: "POST", body: "{}" });
export const createQuest = (seed: Partial<Quest> & { title: string }) => questReq<Quest>(`/radian/quests`, { method: "POST", body: JSON.stringify(seed) });
export const questAction = (id: string, action: string) => questReq<Quest>(`/radian/quests/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
export const snoozeQuest = (id: string, hours = 24) => questReq<Quest>(`/radian/quests/${id}/snooze`, { method: "POST", body: JSON.stringify({ hours }) });
export const resumeQuest = (id: string) => questReq<Quest>(`/radian/quests/${id}/resume`, { method: "POST", body: "{}" });
export const acceptQuest = async (id: string) => { await questAction(id, "accept"); return questAction(id, "start"); };
export const convertQuestToProject = (id: string) => questReq<{ project: string }>(`/radian/quests/${id}/convert-project`, { method: "POST", body: "{}" });
export async function deleteQuest(id: string): Promise<boolean> {
  if (!apiEnabled() || !getToken()) return false;
  try { return (await fetch(`${BASE}/radian/quests/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${getToken()}` } })).ok; } catch { return false; }
}
export async function unarchiveCapture(id: string): Promise<boolean> {
  if (!apiEnabled() || !getToken()) return false;
  try { return (await fetch(`${BASE}/captures/${id}/unarchive`, { method: "POST", headers: { authorization: `Bearer ${getToken()}` } })).ok; } catch { return false; }
}
/** Node item-action: permanent delete (cascades edges, emits a `deleted` event). */
export async function deleteNode(id: string): Promise<boolean> {
  if (!apiEnabled() || !getToken()) return false;
  try { return (await fetch(`${BASE}/nodes/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${getToken()}` } })).ok; } catch { return false; }
}
/** Generic item delete for the remaining entities (context packs, briefs, timeline, projects). */
async function delAt(path: string): Promise<boolean> {
  if (!apiEnabled() || !getToken()) return false;
  try { return (await fetch(`${BASE}${path}`, { method: "DELETE", headers: { authorization: `Bearer ${getToken()}` } })).ok; } catch { return false; }
}
export const deleteContextPack = (id: string) => delAt(`/context-packs/${id}`);
export const deleteBrief = (id: string) => delAt(`/briefs/${id}`);
export const deleteTimelineEvent = (id: string) => delAt(`/timeline/${id}`);
export const deleteProject = (id: string) => delAt(`/projects/${id}`);

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
