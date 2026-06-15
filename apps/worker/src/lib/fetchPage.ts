// Wave 6 — safe readable-page fetcher for URL captures. Lets ingestion reason about
// what a shared link ACTUALLY is (real page text), instead of classifying from the
// URL string alone. Runs in the in-process worker (has egress on Render). Best-effort:
// any failure returns null and the caller falls back to title/note — never fabricates.
import { lookup } from "node:dns/promises";

const MAX_BYTES = 1_500_000; // don't pull huge pages
const TIMEOUT_MS = 8_000;
const MAX_TEXT = 6_000; // chars of extracted body handed to the model

export interface ReadablePage { url: string; title: string; description: string; text: string; chars: number }

// SSRF guard: only public http(s) hosts. Blocks localhost, link-local, and private
// ranges (incl. the cloud metadata IP) after resolving the hostname.
function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function safeHost(url: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (/^(localhost|.*\.local)$/i.test(u.hostname)) return false;
  try {
    const results = await lookup(u.hostname, { all: true });
    return results.length > 0 && results.every((r) => !isPrivateIp(r.address));
  } catch {
    return false;
  }
}

/** Strip a WebVTT-free HTML document to readable text + title/description. */
export function extractReadable(html: string): { title: string; description: string; text: string } {
  const pick = (re: RegExp) => (html.match(re)?.[1] || "").trim();
  const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const body = html
    .replace(/<(script|style|noscript|svg|head|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return { title: decodeEntities(title), description: decodeEntities(description), text: body.slice(0, MAX_TEXT) };
}

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Fetch a public RSS/Atom feed and return raw XML (SSRF-guarded). null on any failure. */
export async function fetchFeedText(url: string): Promise<string | null> {
  if (!(await safeHost(url))) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "IndigoldBot/1.0 (+https://indigold.app)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a public JSON API (SSRF-guarded). Returns parsed JSON, or null on any failure. */
export async function fetchJson(url: string): Promise<unknown | null> {
  if (!(await safeHost(url))) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "IndigoldBot/1.0 (+https://indigold.app; mailto:owner@indigold.app)", accept: "application/json" },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return JSON.parse(new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES)));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a public web page and return readable text. null on any failure/guard. */
export async function fetchReadable(url: string): Promise<ReadablePage | null> {
  if (!(await safeHost(url))) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "IndigoldBot/1.0 (+https://indigold.app)", accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
    const { title, description, text } = extractReadable(html);
    if (!text && !title) return null;
    return { url, title, description, text, chars: text.length };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
