import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Hybrid offline policy: register a best-effort service worker for app-shell +
// fixture caching. Fonts/images may still come from the network on first load;
// see public/sw.js and README for the path to fully-local assets.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline-first is best-effort; ignore registration failures */
    });
  });
}

// Capacitor deep-link bridge (no-op in a normal browser). When wrapped in the
// native iOS shell, the Share Extension opens indigold://share?… or
// indigold://capture?… — route that into the SPA. Uses the globally-injected
// Capacitor runtime, so no bundler dependency is added to the web build.
(() => {
  const cap = (window as unknown as {
    Capacitor?: { Plugins?: { App?: { addListener: (e: string, cb: (d: { url: string }) => void) => void } } };
  }).Capacitor;
  const AppPlugin = cap?.Plugins?.App;
  if (!AppPlugin) return;
  AppPlugin.addListener("appUrlOpen", (data) => {
    try {
      const u = new URL(data.url); // e.g. indigold://share?url=…
      const route = (u.host || u.pathname.replace(/^\/+/, "") || "share").toLowerCase();
      window.location.assign((route === "capture" ? "/capture" : "/share") + (u.search || ""));
    } catch {
      /* ignore malformed deep links */
    }
  });
})();

// iOS standalone PWAs can launch at the manifest start_url ("/") and drop the
// requested path while keeping the query string. If capture params arrive on a
// non-capture route, route to /capture so Share Sheet links still pre-fill.
(() => {
  try {
    const path = window.location.pathname;
    if (path === "/capture" || path === "/share" || path === "/share-target") return;
    const q = new URLSearchParams(window.location.search);
    const hasCaptureParams = ["url", "content", "text", "title", "type", "note", "tags"].some((k) => q.get(k));
    if (hasCaptureParams) window.location.replace("/capture" + window.location.search);
  } catch {
    /* ignore */
  }
})();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
