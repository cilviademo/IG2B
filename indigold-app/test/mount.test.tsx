/* Runtime smoke test: mount the real <App/> in jsdom with a local fetch stub and
 * walk every route, asserting each view renders expected content after data load.
 * Run: pnpm exec tsx test/mount.test.tsx */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const w = dom.window as unknown as Window & typeof globalThis;
const g = globalThis as Record<string, unknown>;
g.window = w;
g.document = w.document;
g.location = w.location;
g.history = w.history;
g.addEventListener = w.addEventListener.bind(w);
g.removeEventListener = w.removeEventListener.bind(w);
g.dispatchEvent = w.dispatchEvent.bind(w);
g.Event = (w as unknown as Record<string, unknown>).Event;
g.CustomEvent = (w as unknown as Record<string, unknown>).CustomEvent;
g.PopStateEvent = (w as unknown as Record<string, unknown>).PopStateEvent;
g.HTMLElement = (w as unknown as Record<string, unknown>).HTMLElement;
g.HTMLCanvasElement = (w as unknown as Record<string, unknown>).HTMLCanvasElement;
g.Node = (w as unknown as Record<string, unknown>).Node;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
const mm = () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
(w as unknown as Record<string, unknown>).matchMedia = mm;
g.matchMedia = mm;

const PUB = path.resolve("client/public");
g.fetch = async (url: string) => {
  const rel = String(url).replace(/^https?:\/\/[^/]+/, "");
  const body = fs.readFileSync(path.join(PUB, rel), "utf8");
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};

const routes = [
  { path: "/", expect: ["Mission Control", "Daily Brief"] },
  { path: "/inbox", expect: ["Capture Inbox", "Apple Note", "Instagram Reel", "Triage"] },
  { path: "/timeline", expect: ["Temporal View"] },
  { path: "/atlas", expect: ["Liminal Atlas", "nodes"] },
  { path: "/context", expect: ["Context Pack", "Token Budget"] },
  { path: "/brief", expect: ["Weekly Brief", "Executive Summary"] },
  { path: "/io", expect: ["Import / Export", "Export Local Data"] },
  { path: "/zzz-unknown", expect: ["404"] },
];

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const App = (await import("../client/src/App.tsx")).default;

let fails = 0;
for (const r of routes) {
  w.history.pushState({}, "", r.path);
  const container = w.document.createElement("div");
  w.document.body.appendChild(container);
  const root = createRoot(container);
  root.render(React.createElement(App));
  await new Promise((res) => setTimeout(res, 350));
  const txt = container.textContent || "";
  const missing = r.expect.filter((e) => !txt.includes(e));
  const ok = missing.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.path.padEnd(14)}${ok ? "" : "  missing: " + missing.join(", ")}`);
  if (!ok) {
    fails++;
    console.log("   text:", txt.slice(0, 180).replace(/\s+/g, " "));
  }
  root.unmount();
  container.remove();
}
console.log(fails ? `\n${fails} ROUTE(S) FAILED` : "\nALL ROUTES RENDER (runtime jsdom) ✓");
process.exit(fails ? 1 : 0);
