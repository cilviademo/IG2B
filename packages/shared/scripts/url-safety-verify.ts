// Wave 6 SSRF guard tests — pure, no network.  npx tsx packages/shared/scripts/url-safety-verify.ts
import { isSafeFetchUrl, isAdvancedMediaAllowed, ADVANCED_MEDIA_DOMAINS, FETCH_LIMITS } from "../src/url-safety";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// Blocked: loopback / private / link-local / metadata / non-http / creds / internal TLD.
for (const [u, why] of [
  ["http://localhost/x", "localhost"], ["http://127.0.0.1/x", "loopback"], ["http://10.0.0.5/x", "10/8"],
  ["http://192.168.1.1/", "192.168"], ["http://172.16.0.1/", "172.16/12"], ["http://169.254.169.254/latest/meta-data", "cloud metadata"],
  ["http://[::1]/", "ipv6 loopback"], ["https://foo.internal/", "internal tld"], ["file:///etc/passwd", "scheme"],
  ["http://user:pass@evil.com/", "creds"], ["ftp://x.com", "scheme"], ["not a url", "invalid"],
] as const) {
  ok(`block ${why}`, isSafeFetchUrl(u).ok === false, u);
}
// Allowed: ordinary public https.
for (const u of ["https://youtube.com/watch?v=x", "https://example.com/article", "http://news.site/p/1"]) {
  ok(`allow ${u}`, isSafeFetchUrl(u).ok === true);
}
// Advanced media is opt-in + domain-limited.
ok("advanced off → blocked even for youtube", isAdvancedMediaAllowed("https://youtube.com/watch?v=x", false) === false);
ok("advanced on → youtube allowed", isAdvancedMediaAllowed("https://www.youtube.com/watch?v=x", true) === true);
ok("advanced on → random domain still blocked", isAdvancedMediaAllowed("https://evil.com/x", true) === false);
ok("advanced on → private ip blocked", isAdvancedMediaAllowed("http://127.0.0.1/x", true) === false);
ok("advanced domain list covers the 5 platforms", ADVANCED_MEDIA_DOMAINS.length >= 6);
ok("fetch limits are sane", FETCH_LIMITS.maxBytes > 0 && FETCH_LIMITS.timeoutMs > 0 && FETCH_LIMITS.maxRedirects >= 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
