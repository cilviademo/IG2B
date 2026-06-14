// "One vault reality" — device identity, pairing, and force-sync.
//
// WHY THIS EXISTS: the PWA never shows a login; `ensureSession()` silently mints a
// RANDOM per-device account (stored in localStorage `indigold_device`). On iOS an
// installed home-screen PWA has a SEPARATE storage partition from Safari, so each
// surface mints its OWN account → two different server vaults that can never
// converge. The fix is to let one surface ADOPT another's device account via a
// pairing code, plus honest sync status + a manual Force Sync.

import {
  apiEnabled, apiBaseUrl, getToken, clearToken, ensureSession, lastSessionError,
  fetchCaptures, getLiveNodes, getLiveEdges,
} from "./api";
import { listCaptures } from "./captureStore";
import { BUILD_COMMIT, BUILD_TIME } from "./buildInfo";

const DEVICE_KEY = "indigold_device"; // must match api.ts
const LAST_SYNC_KEY = "indigold_last_sync";
export const VAULT_SYNCED_EVENT = "indigold:vault-synced";

export interface DeviceCreds { email: string; password: string }

export function deviceCreds(): DeviceCreds | null {
  try {
    const v = JSON.parse(localStorage.getItem(DEVICE_KEY) || "null");
    return v && v.email && v.password ? v : null;
  } catch {
    return null;
  }
}
export function deviceEmail(): string | null {
  return deviceCreds()?.email ?? null;
}

// ---- Pairing code -----------------------------------------------------------
// Carries this surface's device account so another surface adopts the SAME vault.
// Format: "IG1." + base64url(JSON{e,p}). This IS the vault credential — treat it
// like a password (anyone with it can read this vault). It never leaves the device
// except when the owner deliberately copies it across their own surfaces.
const PAIR_PREFIX = "IG1.";
function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
}

/** Produce a pairing code for THIS surface's vault (minting the account first if
 *  needed). Returns null if the API is off. */
export async function pairingCode(): Promise<string | null> {
  if (!apiEnabled()) return null;
  if (!deviceCreds() && !(await ensureSession())) return null;
  const c = deviceCreds();
  if (!c) return null;
  return PAIR_PREFIX + b64urlEncode(JSON.stringify({ e: c.email, p: c.password }));
}

export interface PairResult { ok: boolean; email?: string; error?: string }

/** Adopt the vault encoded in `raw`: replace this surface's device account, drop
 *  any stale token, re-auth as the paired account, then pull its data. After this
 *  the two surfaces read the SAME server vault. */
export async function applyPairingCode(raw: string): Promise<PairResult> {
  const code = (raw || "").trim();
  if (!code.startsWith(PAIR_PREFIX)) return { ok: false, error: "That isn't an Indigold pairing code." };
  let creds: DeviceCreds;
  try {
    const o = JSON.parse(b64urlDecode(code.slice(PAIR_PREFIX.length))) as { e?: string; p?: string };
    if (!o.e || !o.p) throw new Error("missing fields");
    creds = { email: o.e, password: o.p };
  } catch {
    return { ok: false, error: "Pairing code is corrupt or incomplete." };
  }
  localStorage.setItem(DEVICE_KEY, JSON.stringify(creds));
  clearToken(); // force a fresh login as the adopted account
  if (!(await ensureSession())) {
    return { ok: false, error: lastSessionError() || "Couldn't sign in with that pairing code." };
  }
  const sync = await forceSync();
  return { ok: true, email: creds.email, ...(sync.error ? { error: sync.error } : {}) };
}

// ---- Force sync -------------------------------------------------------------
export interface SyncResult {
  ok: boolean;
  captures: number | null;
  nodes: number | null;
  edges: number | null;
  at: string;
  error?: string;
}
let lastResult: SyncResult | null = null;
export const lastSyncResult = (): SyncResult | null => lastResult;
export const lastSyncAt = (): string | null => localStorage.getItem(LAST_SYNC_KEY);

/** Pull the authoritative server vault (captures + graph) for the CURRENT device
 *  account, record counts + a last-sync stamp, and notify live views to re-render.
 *  Server is authoritative for synced objects. */
export async function forceSync(): Promise<SyncResult> {
  const at = new Date().toISOString();
  const fail = (error: string): SyncResult => {
    lastResult = { ok: false, captures: null, nodes: null, edges: null, at, error };
    window.dispatchEvent(new CustomEvent(VAULT_SYNCED_EVENT, { detail: lastResult }));
    return lastResult;
  };
  if (!apiEnabled()) return fail("API not configured (VITE_API_URL unset).");
  if (!(await ensureSession())) return fail(lastSessionError() || "couldn't sign in");

  const [caps, nodes, edges] = await Promise.all([fetchCaptures(), getLiveNodes(), getLiveEdges()]);
  // `captures` is the canonical reachability signal (fetchCaptures returns null on
  // any unreachable/auth/cold-start failure).
  if (caps === null) return fail("couldn't reach the API (waking? retry in ~30s)");

  lastResult = {
    ok: true,
    captures: caps.length,
    nodes: nodes?.nodes ? (nodes.nodes as unknown[]).length : null,
    edges: edges?.edges ? (edges.edges as unknown[]).length : null,
    at,
  };
  localStorage.setItem(LAST_SYNC_KEY, at);
  window.dispatchEvent(new CustomEvent(VAULT_SYNCED_EVENT, { detail: lastResult }));
  return lastResult;
}

/** Subscribe to force-sync completions (so Inbox/Atlas re-pull). */
export function onVaultSynced(cb: (r: SyncResult) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail as SyncResult);
  window.addEventListener(VAULT_SYNCED_EVENT, h);
  return () => window.removeEventListener(VAULT_SYNCED_EVENT, h);
}

/** Is the vault stale? True when the API is configured but the last sync failed
 *  (or we've never synced). Drives the "tap Force Sync" banner — we never show
 *  stale data silently. */
export function isVaultStale(): boolean {
  if (!apiEnabled()) return false;
  if (lastResult && !lastResult.ok) return true;
  if (!lastResult && !lastSyncAt()) return true;
  return false;
}

// ---- Environment snapshot ---------------------------------------------------
/** Installed (home-screen / standalone) PWA vs an in-browser tab. The crux of the
 *  divergence: these two modes are separate storage partitions on iOS. */
export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** Ask the active service worker its cache version (round-trip via MessageChannel). */
export async function swVersion(timeoutMs = 1500): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  let sw: ServiceWorker | null = navigator.serviceWorker.controller;
  if (!sw) {
    try { sw = (await navigator.serviceWorker.getRegistration())?.active ?? null; } catch { sw = null; }
  }
  if (!sw) return null;
  const target = sw;
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve((e.data && e.data.version) || null); };
    try { target.postMessage({ type: "VERSION" }, [ch.port2]); } catch { clearTimeout(t); resolve(null); }
  });
}

export interface VaultSnapshot {
  origin: string;
  route: string;
  standalone: boolean;
  buildCommit: string;
  buildTime: string;
  swVersion: string | null;
  apiUrl: string;
  apiHealth: "ok" | "down" | "n/a";
  tokenPresent: boolean;
  deviceEmail: string | null;
  lastSync: string | null;
  localCaptures: number;
  serverCaptures: number | null;
  serverNodes: number | null;
  serverEdges: number | null;
  namespace: string;
}

/** A full environment + parity snapshot for the Debug/Sync panel. Reads server
 *  counts from the most recent forceSync (call forceSync() first for live numbers). */
export async function snapshot(): Promise<VaultSnapshot> {
  let apiHealth: VaultSnapshot["apiHealth"] = "n/a";
  if (apiEnabled()) {
    try {
      const r = await fetch(`${apiBaseUrl()}/health`, { cache: "no-store" });
      apiHealth = r.ok ? "ok" : "down";
    } catch {
      apiHealth = "down";
    }
  }
  const last = lastSyncResult();
  return {
    origin: typeof location !== "undefined" ? location.origin : "",
    route: typeof location !== "undefined" ? location.pathname : "",
    standalone: isStandalone(),
    buildCommit: BUILD_COMMIT,
    buildTime: BUILD_TIME,
    swVersion: await swVersion(),
    apiUrl: apiBaseUrl() || "(standalone — no API)",
    apiHealth,
    tokenPresent: !!getToken(),
    deviceEmail: deviceEmail(),
    lastSync: lastSyncAt(),
    localCaptures: listCaptures().length,
    serverCaptures: last?.captures ?? null,
    serverNodes: last?.nodes ?? null,
    serverEdges: last?.edges ?? null,
    namespace: "localStorage indigold_* · SW cache",
  };
}
