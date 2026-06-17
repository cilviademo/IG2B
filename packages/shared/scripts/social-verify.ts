// Capture enrichment (oEmbed / thin-content) — pure.  npx tsx packages/shared/scripts/social-verify.ts
import { oEmbedUrlFor, parseOEmbed, oEmbedToContent, isThinContent } from "../src/social";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// 1. oEmbed endpoint mapping (open providers only).
ok("youtube → oembed", oEmbedUrlFor("https://www.youtube.com/watch?v=abc")?.startsWith("https://www.youtube.com/oembed?url=") === true);
ok("youtu.be short → oembed", !!oEmbedUrlFor("https://youtu.be/abc"));
ok("vimeo → oembed", oEmbedUrlFor("https://vimeo.com/123")?.includes("vimeo.com/api/oembed.json") === true);
ok("tiktok → oembed", oEmbedUrlFor("https://www.tiktok.com/@x/video/1")?.includes("tiktok.com/oembed") === true);
ok("instagram → null (needs token, honest)", oEmbedUrlFor("https://instagram.com/p/abc") === null);
ok("unknown host → null", oEmbedUrlFor("https://example.com/x") === null);
ok("garbage url → null", oEmbedUrlFor("not a url") === null);
ok("url is encoded in endpoint", oEmbedUrlFor("https://vimeo.com/1?a=b")?.includes(encodeURIComponent("https://vimeo.com/1?a=b")) === true);

// 2. parseOEmbed.
{
  const e = parseOEmbed({ title: "My Reel", author_name: "Ada", provider_name: "YouTube", thumbnail_url: "https://t/x.jpg" });
  ok("parses title/author/provider", !!e && e.title === "My Reel" && e.author === "Ada" && e.provider === "YouTube");
  ok("thumbnail captured", e!.thumbnail === "https://t/x.jpg");
  ok("empty json → null", parseOEmbed({}) === null && parseOEmbed(null) === null);
  ok("content snippet composes", oEmbedToContent(e!) === "My Reel by Ada (YouTube)");
}

// 3. isThinContent — the "needs content" detector.
ok("empty content → thin", isThinContent("", "instagram", "https://instagram.com"));
ok("bare domain content → thin", isThinContent("instagram.com", "instagram", "https://instagram.com"));
ok("content == title → thin", isThinContent("instagram", "instagram", "https://instagram.com"));
ok("real body → not thin", !isThinContent("A 600-word essay on attention and memory systems in personal computing.", "instagram", "https://instagram.com"));
ok("short distinct note is not a bare-domain echo", !isThinContent("hi", "instagram"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
