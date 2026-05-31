// API client for the Indigold backend (indigold-api).
// If VITE_API_URL is unset the PWA runs fully standalone on the bundled
// synthetic fixtures (public/data/*.json) — so the Static Site works with or
// without the backend. When set, these helpers talk to the live API.
const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";

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
