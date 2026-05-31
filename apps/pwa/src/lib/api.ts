// API client for the Indigold backend (indigold-api).
// If VITE_API_URL is unset the PWA runs fully standalone on the bundled
// synthetic fixtures (public/data/*.json) — so the Static Site works with or
// without the backend. When set, these helpers talk to the live API.
// Render's `fromService … property: host` injects a bare hostname (no scheme),
// so normalize to an absolute https URL. Empty => standalone fixtures mode.
const RAW = ((import.meta as { env?: Record<string, string> }).env?.VITE_API_URL || "").trim();
const BASE = RAW ? (/^https?:\/\//.test(RAW) ? RAW : `https://${RAW}`).replace(/\/$/, "") : "";

export const apiEnabled = () => BASE !== "";

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

/** Ensure we have a bearer token — uses a per-device account so the user never
 *  sees a login screen (keeps the "no forms" UX). Returns false if API is off. */
export async function ensureSession(): Promise<boolean> {
  if (!apiEnabled()) return false;
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
    if (!r.ok) return false;
    const j = (await r.json()) as { token?: string };
    if (j.token) {
      setToken(j.token);
      return true;
    }
  } catch {
    /* offline / asleep — stay local */
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

/** Push one capture to the backend (creates a capture -> enqueues worker pipeline). */
export async function syncCaptureToApi(cap: SyncableCapture): Promise<boolean> {
  if (!apiEnabled()) return false;
  if (!getToken() && !(await ensureSession())) return false;
  try {
    const body = {
      type: cap.type,
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
