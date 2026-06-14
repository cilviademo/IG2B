// Wave 6 — URL safety (SSRF defence) for the Universal Intake Router. Pure + deterministic.
// The router/fetcher MUST call isSafeFetchUrl() before any server-side fetch of a shared URL.
// NOTE: this is the URL-level guard (scheme/host/port/private-range). The actual fetch layer
// must ALSO (a) resolve DNS and re-check the resolved IP against the same private ranges
// (DNS-rebinding defence), (b) cap timeout + response bytes, (c) not follow redirects to
// blocked hosts. Those live in the server fetch wrapper; this module is the policy core.

export interface UrlVerdict { ok: boolean; reason?: string; host?: string }

// Private / loopback / link-local / metadata ranges — never fetchable.
const BLOCKED_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64/10 CGNAT
];
const BLOCKED_HOSTS = new Set(["localhost", "ip6-localhost", "metadata.google.internal"]);

function isIpv4(h: string) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h); }

/** Is this URL safe to fetch server-side? (scheme + host policy; see module note for the rest.) */
export function isSafeFetchUrl(raw: string): UrlVerdict {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: "invalid_url" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "scheme_not_http" };
  if (u.username || u.password) return { ok: false, reason: "embedded_credentials" };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "no_host" };
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: "blocked_host", host };
  if (host.endsWith(".local") || host.endsWith(".internal")) return { ok: false, reason: "internal_tld", host };
  // IPv6 loopback / unique-local / link-local.
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return { ok: false, reason: "private_ipv6", host };
  if (isIpv4(host)) {
    if (BLOCKED_V4.some((re) => re.test(host))) return { ok: false, reason: "private_ipv4", host };
    if (host === "169.254.169.254") return { ok: false, reason: "cloud_metadata", host };
  }
  return { ok: true, host };
}

// Advanced media extraction (yt-dlp) is OPT-IN and domain-limited — never global.
export const ADVANCED_MEDIA_DOMAINS = [
  "youtube.com", "youtu.be", "instagram.com", "tiktok.com", "facebook.com", "fb.watch", "vimeo.com",
];
export function isAdvancedMediaAllowed(raw: string, enabled: boolean): boolean {
  if (!enabled) return false;
  const v = isSafeFetchUrl(raw);
  if (!v.ok || !v.host) return false;
  return ADVANCED_MEDIA_DOMAINS.some((d) => v.host === d || v.host!.endsWith(`.${d}`));
}

// Fetch guardrails (the server fetch wrapper enforces these).
export const FETCH_LIMITS = { timeoutMs: 10_000, maxBytes: 5_000_000, maxRedirects: 3 };
