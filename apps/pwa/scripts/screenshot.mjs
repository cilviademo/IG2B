// Screenshot the built PWA at iPhone size (390x844) for the redesign gallery.
// Usage: node scripts/screenshot.mjs <theme: dark|light> [route ...]
// Serves ./dist, sets the theme class, captures each route to scripts/shots/.

import { createRequire } from "module";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire("/home/user/IG2B/indigold-app/");
const puppeteer = require("puppeteer-core");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PWA = path.resolve(__dirname, "..");
const DIST = path.join(PWA, "dist");
const OUTDIR = path.join(__dirname, "shots");
const CHROME = "/home/user/IG2B/indigold-app/.pptr/chrome-headless-shell/linux-131.0.6778.204/chrome-headless-shell-linux64/chrome-headless-shell";
const PORT = 8795;

const theme = process.argv[2] === "light" ? "light" : "dark";
const routes = process.argv.slice(3);
const ROUTES = routes.length ? routes : ["/", "/inbox", "/timeline", "/atlas", "/context", "/brief", "/io"];

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  let fp = path.join(DIST, p);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(DIST, "index.html");
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "content-type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(buf);
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  for (const route of ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle0" });
    await page.evaluate((t) => { document.documentElement.classList.remove("dark", "light"); document.documentElement.classList.add(t); }, theme);
    await sleep(700);
    const name = (route === "/" ? "home" : route.replace(/\//g, "")) + `-${theme}.png`;
    await page.screenshot({ path: path.join(OUTDIR, name) });
    console.log("shot:", name);
  }
  await browser.close();
  server.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
