// Headless verification for the file-upload capture flow.
//
// Drives the REAL built PWA (built with VITE_API_URL pointed at a local stub)
// through the /capture form file picker against a stub API that emulates the
// happy path, a stale-token 401 (re-mint + retry), an oversize file (client
// pre-check), and an asleep/offline API (queue locally + retry on refresh).
//
// Honest by construction: it asserts the on-screen status text the user sees,
// not internal calls. NOTE (per project discipline): a green run here proves the
// client wiring; it does NOT prove the live Render+R2 path — that's the user's
// live re-test. Run: node scripts/verify-upload.mjs   (expects 3/3).

import { createRequire } from "module";
import { spawnSync } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire("/home/user/IG2B/indigold-app/");
const puppeteer = require("puppeteer-core");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PWA = path.resolve(__dirname, "..");
const OUT = path.join(PWA, "dist-verify");
const CHROME =
  "/home/user/IG2B/indigold-app/.pptr/chrome-headless-shell/linux-131.0.6778.204/chrome-headless-shell-linux64/chrome-headless-shell";

const API_PORT = 8791;
const WEB_PORT = 8792;
const API = `http://localhost:${API_PORT}`;

// ---- Stub API -------------------------------------------------------------
// Behavior is steered by mutable flags so one server covers every scenario.
const state = { mode: "happy", uploadCalls: 0, firstUpload401: false, asleep: false };
const captures = [];

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(body);
}

const apiServer = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url, API);

  if (state.asleep) {
    // Emulate a cold/asleep service: drop the socket so fetch() rejects.
    req.destroy();
    return;
  }

  if (url.pathname === "/auth/register" || url.pathname === "/auth/login") {
    return send(res, 200, { token: "tok_" + Date.now() });
  }

  if (url.pathname === "/capture/upload" && req.method === "POST") {
    state.uploadCalls++;
    if (state.firstUpload401 && state.uploadCalls === 1) {
      return send(res, 401, { error: "unauthorized" });
    }
    // Consume the body, then 201 with an asset + signed URL.
    let size = 0;
    req.on("data", (c) => (size += c.length));
    req.on("end", () => {
      const id = "asset_" + state.uploadCalls;
      const cap = { id: "cap_" + state.uploadCalls, type: "screenshot", title: "upload", source: "files", screenshot_ref: id };
      captures.unshift({ ...cap, captured_at: new Date().toISOString(), sensitivity: "private", processing_status: "queued", status: "inbox", note: "", url: null });
      send(res, 201, {
        capture: cap,
        asset: { id, filename: "test.png", mime: "image/png", size_bytes: size, kind: "image" },
        signed_url: `${API}/signed/${id}?t=${Date.now()}`,
      });
    });
    return;
  }

  if (url.pathname === "/captures" && req.method === "GET") {
    return send(res, 200, { items: captures });
  }
  if (url.pathname.startsWith("/assets/") && url.pathname.endsWith("/url")) {
    return send(res, 200, { url: `${API}/signed/x?t=${Date.now()}`, expires_in: 900 });
  }
  return send(res, 404, { error: "not_found" });
});

// ---- Static server (serves the built PWA with SPA fallback) ---------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const webServer = http.createServer((req, res) => {
  const reqPath = decodeURIComponent(new URL(req.url, `http://localhost:${WEB_PORT}`).pathname);
  let fp = path.join(OUT, reqPath);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(OUT, "index.html"); // SPA fallback
  const ext = path.extname(fp);
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  });
});

// ---- Helpers --------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makePng(bytes) {
  // A real PNG header + padding so the browser treats it as image/png.
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, bytes - header.length), 7)]);
}

async function pickAndUpload(page, filePath) {
  const input = await page.$('input[type="file"]');
  await input.uploadFile(filePath);
  await sleep(150);
}

async function statusText(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("p")].find((p) => /sync status:/i.test(p.textContent || ""));
    return el ? el.textContent : "";
  });
}
async function fileErrText(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("p")].find((p) => /over the .* MB limit/i.test(p.textContent || ""));
    return el ? el.textContent : "";
  });
}
async function clickSave(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /Upload File|Save Capture|Uploading|Saving/.test(b.textContent || ""));
    if (btn) btn.click();
  });
}
async function waitForStatus(page, re, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const t = await statusText(page);
    if (re.test(t)) return t;
    await sleep(120);
  }
  return statusText(page);
}

// ---- Scenarios ------------------------------------------------------------
async function run() {
  const tmp = fs.mkdtempSync("/tmp/iglverify-");
  const smallPng = path.join(tmp, "small.png");
  const bigPng = path.join(tmp, "big.png");
  fs.writeFileSync(smallPng, makePng(2048));
  fs.writeFileSync(bigPng, makePng(51 * 1024 * 1024)); // > 50 MB -> client pre-check blocks

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

  async function fresh() {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${WEB_PORT}/capture`, { waitUntil: "networkidle0" });
    await page.evaluate(() => { localStorage.clear(); });
    // service worker is irrelevant for these origin-local API calls; ensure none cached
    await page.goto(`http://localhost:${WEB_PORT}/capture`, { waitUntil: "networkidle0" });
    await page.waitForSelector('input[type="file"]', { timeout: 5000 });
    return page;
  }

  // 1) Happy path
  {
    state.mode = "happy"; state.uploadCalls = 0; state.firstUpload401 = false; state.asleep = false; captures.length = 0;
    const page = await fresh();
    await pickAndUpload(page, smallPng);
    await clickSave(page);
    // Success navigates to the vault (/inbox); failure would stay on the form.
    await page.waitForFunction(() => location.pathname === "/inbox", { timeout: 8000 }).catch(() => {});
    check("happy upload -> navigates to vault", page.url().endsWith("/inbox"), page.url());
    check("happy upload hit API once", state.uploadCalls === 1, `calls=${state.uploadCalls}`);
    await page.close();
  }

  // 2) Stale token 401 -> re-mint + retry -> success
  {
    state.uploadCalls = 0; state.firstUpload401 = true; state.asleep = false; captures.length = 0;
    const page = await fresh();
    await page.evaluate(() => localStorage.setItem("indigold_token", "stale"));
    await pickAndUpload(page, smallPng);
    await clickSave(page);
    await page.waitForFunction(() => location.pathname === "/inbox", { timeout: 8000 }).catch(() => {});
    check("401 re-mint + retry -> navigates to vault", page.url().endsWith("/inbox"), page.url());
    check("401 path retried (2 calls)", state.uploadCalls === 2, `calls=${state.uploadCalls}`);
    await page.close();
  }

  // 3) Oversize -> client pre-check blocks, no network call
  {
    state.uploadCalls = 0; state.firstUpload401 = false; state.asleep = false;
    const page = await fresh();
    await pickAndUpload(page, bigPng);
    const err = await fileErrText(page);
    check("oversize file shows limit error", /over the 50 MB limit/.test(err), err);
    check("oversize file made NO upload call", state.uploadCalls === 0, `calls=${state.uploadCalls}`);
    await page.close();
  }

  // 4) Asleep/offline -> queue locally -> refresh retries -> uploaded
  {
    state.uploadCalls = 0; state.firstUpload401 = false; state.asleep = true; captures.length = 0;
    const page = await fresh();
    await pickAndUpload(page, smallPng);
    await clickSave(page);
    const t = await waitForStatus(page, /NOT uploaded/);
    check("asleep API -> honest 'NOT uploaded ... will retry'", /NOT uploaded/.test(t), t);
    const queued = await page.evaluate(() => JSON.parse(localStorage.getItem("indigold_upload_queue_v1") || "[]").length);
    check("asleep API -> file queued locally", queued === 1, `queued=${queued}`);

    // Wake the API and refresh the Inbox -> flushUploadQueue drains it.
    state.asleep = false;
    await page.goto(`http://localhost:${WEB_PORT}/inbox`, { waitUntil: "networkidle0" });
    await sleep(2500); // refresh runs on mount (ensureSession + flushUploadQueue + fetch)
    const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem("indigold_upload_queue_v1") || "[]").length);
    check("refresh drains the upload queue", remaining === 0 && state.uploadCalls >= 1, `remaining=${remaining}, calls=${state.uploadCalls}`);
    await page.close();
  }

  await browser.close();
  return results;
}

// ---- Orchestration --------------------------------------------------------
async function main() {
  console.log("Building PWA with VITE_API_URL=" + API + " ...");
  const build = spawnSync("npx", ["vite", "build", "--outDir", "dist-verify"], {
    cwd: PWA, encoding: "utf8", env: { ...process.env, VITE_API_URL: API },
  });
  if (build.status !== 0) { console.error(build.stdout, build.stderr); process.exit(1); }

  await new Promise((r) => apiServer.listen(API_PORT, r));
  await new Promise((r) => webServer.listen(WEB_PORT, r));

  const runs = Number(process.argv[2] || 3);
  let allPass = true;
  for (let i = 1; i <= runs; i++) {
    console.log(`\n===== RUN ${i}/${runs} =====`);
    const results = await run();
    const passed = results.filter((r) => r.ok).length;
    const ok = results.every((r) => r.ok);
    allPass = allPass && ok;
    console.log(`RUN ${i}: ${passed}/${results.length} checks passed`);
  }

  apiServer.close(); webServer.close();
  fs.rmSync(OUT, { recursive: true, force: true });
  console.log(`\n${allPass ? "ALL RUNS GREEN ✓" : "SOME RUNS FAILED ✗"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
