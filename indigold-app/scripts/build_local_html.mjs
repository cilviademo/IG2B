/* Build a fully self-contained, file:// -openable single HTML for Indigold.
 * Inlines CSS + JS, embeds all fixtures, bakes images to data-URIs, and shims
 * fetch() so the app reads embedded data with no server/network.
 * Run AFTER `pnpm build`:  node scripts/build_local_html.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(dirname, "..");
const DIST = path.join(ROOT, "dist", "public");
const PUB = path.join(ROOT, "client", "public");
const OUT = path.resolve(ROOT, "..", "indigold-local.html");

// --- locate hashed build assets ---
const assetsDir = path.join(DIST, "assets");
const jsFile = fs.readdirSync(assetsDir).find((f) => f.endsWith(".js"));
const cssFile = fs.readdirSync(assetsDir).find((f) => f.endsWith(".css"));
let js = fs.readFileSync(path.join(assetsDir, jsFile), "utf8");
const css = fs.readFileSync(path.join(assetsDir, cssFile), "utf8");

// --- bake images into data-URIs and replace their path literals in the JS ---
const images = ["hero-dashboard", "graph-constellation", "timeline-header", "weekly-brief"];
for (const name of images) {
  const b64 = fs.readFileSync(path.join(PUB, "images", `${name}.png`)).toString("base64");
  const dataUri = `data:image/png;base64,${b64}`;
  js = js.split(`/images/${name}.png`).join(dataUri);
}

// --- embed all fixtures + build a fetch shim ---
const dataFiles = [
  "sample_nodes",
  "sample_edges",
  "sample_timeline",
  "sample_inbox",
  "sample_dashboard",
  "sample_context_pack",
  "sample_weekly_brief",
];
const entries = dataFiles
  .map((n) => `  "/data/${n}.json": ${fs.readFileSync(path.join(PUB, "data", `${n}.json`), "utf8").trim()}`)
  .join(",\n");

const shim = `
window.__IDG__ = {
${entries}
};
(function () {
  var real = (typeof window.fetch === "function") ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || String(input);
    var key = url;
    try { key = new URL(url, location.href).pathname; } catch (e) {}
    var data = window.__IDG__[key];
    if (data === undefined) {
      for (var k in window.__IDG__) { if (key.indexOf(k) !== -1 || url.indexOf(k) !== -1) { data = window.__IDG__[k]; break; } }
    }
    if (data !== undefined) {
      var body = (typeof data === "string") ? data : JSON.stringify(data);
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return real ? real(input, init) : Promise.reject(new Error("offline: " + url));
  };
})();
`;

// guard against premature </script> termination inside inlined blocks
const esc = (s) => s.split("</script").join("<\\/script");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#0a0a12" />
  <title>Indigold (local)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>${esc(shim)}</script>
  <script type="module">${esc(js)}</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
const kb = (html.length / 1024).toFixed(0);
console.log(`wrote ${OUT} (${kb} KB)`);
