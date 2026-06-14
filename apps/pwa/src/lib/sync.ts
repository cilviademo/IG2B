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
  fetchCaptures, getLiveNodes, getLiveEdges, syncCaptureToApi,
  claimAccount, loginAccount, logoutAccount, type AccountResult,
} from "./api";
import { listCaptures, markSynced } from "./captureStore";
import { BUILD_COMMIT, BUILD_TIME } from "./buildInfo";

const DEVICE_KEY = "indigold_device"; // must match api.ts
const LAST_SYNC_KEY = "indigold_last_sync";
const PAIRED_KEY = "indigold_paired_at"; // set when a pairing code is adopted
const CLAIMED_KEY = "indigold_account_email"; // set when a real login/claim succeeds
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
  // Persist the link so it survives relaunches — you paste a code ONCE; from then
  // on every (auto) sync uses it until you explicitly Unlink.
  localStorage.setItem(PAIRED_KEY, new Date().toISOString());
  const sync = await forceSync();
  return { ok: true, email: creds.email, ...(sync.error ? { error: sync.error } : {}) };
}

/** When the current device account was adopted from a pairing code (null = this
 *  surface's own auto-minted account). */
export const pairedAt = (): string | null => localStorage.getItem(PAIRED_KEY);
export const isPaired = (): boolean => !!pairedAt();

/** Forget the linked account: next launch mints a fresh anonymous one. */
export function unlinkDevice(): void {
  localStorage.removeItem(DEVICE_KEY);
  localStorage.removeItem(PAIRED_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  clearToken();
}

// ---- Account (the durable, recoverable identity) ----------------------------
// A real email+password — the fix for iOS wiping the anonymous device account on
// reinstall/eviction. Claim upgrades the CURRENT vault (keeps its data); login
// restores it on any surface. Stored so the silent session re-auths to it.
export const accountEmail = (): string | null => localStorage.getItem(CLAIMED_KEY);
export const isClaimed = (): boolean => !!accountEmail();

/** Secure the current vault with a real email+password (data preserved). */
export async function claim(email: string, password: string): Promise<AccountResult> {
  const r = await claimAccount(email, password);
  if (r.ok) {
    localStorage.setItem(CLAIMED_KEY, email);
    localStorage.removeItem(PAIRED_KEY); // it's now an owned account, not a paired one
    await forceSync();
  }
  return r;
}

/** Log in to an existing vault (after a reinstall, or on a second surface). */
export async function login(email: string, password: string): Promise<AccountResult> {
  const r = await loginAccount(email, password);
  if (r.ok) {
    localStorage.setItem(CLAIMED_KEY, email);
    localStorage.removeItem(PAIRED_KEY);
    await forceSync();
  }
  return r;
}

/** Sign out — next launch mints a fresh anonymous account until you log back in. */
export function logout(): void {
  logoutAccount();
  localStorage.removeItem(CLAIMED_KEY);
  localStorage.removeItem(PAIRED_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
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

  // Two-way: push any unsynced local captures UP first (so an offline capture is
  // intaken even if you never open Inbox), then pull the authoritative vault DOWN.
  try {
    for (const c of listCaptures()) {
      if (c.synced) continue;
      const ok = await syncCaptureToApi({
        type: c.type, source: c.source, title: c.title,
        user_note: c.user_note, body: c.body, url: c.url, sensitivity: c.sensitivity,
      });
      if (ok) markSynced(c.id);
    }
  } catch {
    /* best-effort; the pull below still runs */
  }

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

// ---- Scheduled auto-sync ----------------------------------------------------
// The vault refreshes itself at designated UTC times each day, plus on launch and
// whenever the app is foregrounded — so the data is already there without tapping
// Force Sync. iOS PWAs can't run reliably while fully closed, so a slot that passes
// while the app is shut "catches up" on the next open (we compare lastSync to the
// most recent elapsed slot). On Android/desktop we also register native Periodic
// Background Sync best-effort.
export const SYNC_SLOTS_UTC = [0, 6, 12, 18]; // 00:00 / 06:00 / 12:00 / 18:00 UTC
const FOREGROUND_REFRESH_MS = 5 * 60 * 1000; // also keep it fresh while in use
const AUTO_THROTTLE_MS = 60 * 1000;

function slotTime(d: Date, hour: number): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, 0);
}

/** The latest designated UTC slot at or before `now` (rolls to yesterday's last
 *  slot if `now` is before today's first). */
function mostRecentSlot(now = Date.now()): number {
  const d = new Date(now);
  let best = -Infinity;
  for (const h of SYNC_SLOTS_UTC) {
    const t = slotTime(d, h);
    if (t <= now && t > best) best = t;
  }
  if (best === -Infinity) {
    const y = new Date(now - 86_400_000);
    best = slotTime(y, Math.max(...SYNC_SLOTS_UTC));
  }
  return best;
}

/** The next designated UTC slot strictly after `now`. */
export function nextSlot(now = Date.now()): number {
  const d = new Date(now);
  let best = Infinity;
  for (const h of SYNC_SLOTS_UTC) {
    const t = slotTime(d, h);
    if (t > now && t < best) best = t;
  }
  if (best === Infinity) {
    const tm = new Date(now + 86_400_000);
    best = slotTime(tm, Math.min(...SYNC_SLOTS_UTC));
  }
  return best;
}

/** Has a designated slot elapsed since the last successful sync? */
export function dueForScheduledSync(now = Date.now()): boolean {
  const last = lastSyncAt();
  if (!last) return true;
  return new Date(last).getTime() < mostRecentSlot(now);
}

let lastAutoAttempt = 0;
async function maybeAutoSync(): Promise<void> {
  if (!apiEnabled()) return;
  if (Date.now() - lastAutoAttempt < AUTO_THROTTLE_MS) return;
  const last = lastSyncAt();
  const fresh = last && Date.now() - new Date(last).getTime() < FOREGROUND_REFRESH_MS;
  if (!dueForScheduledSync() && fresh) return; // nothing due and recently synced
  lastAutoAttempt = Date.now();
  await forceSync();
}

async function registerPeriodicSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const ps = (reg as unknown as { periodicSync?: { getTags?: () => Promise<string[]>; register: (t: string, o: { minInterval: number }) => Promise<void> } })?.periodicSync;
    if (!ps) return; // unsupported (iOS) — foreground catch-up covers it
    const tags = (await ps.getTags?.()) || [];
    if (!tags.includes("vault-sync")) await ps.register("vault-sync", { minInterval: 6 * 60 * 60 * 1000 });
  } catch {
    /* permission/unsupported — ignore */
  }
}

/** Start the auto-sync loop (call once at app startup). Returns a stop fn. */
export function startAutoSync(): () => void {
  const onVisible = () => { if (document.visibilityState === "visible") void maybeAutoSync(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  const timer = window.setInterval(() => void maybeAutoSync(), AUTO_THROTTLE_MS);
  void registerPeriodicSync();
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    clearInterval(timer);
  };
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
