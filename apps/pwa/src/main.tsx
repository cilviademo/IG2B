import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Hybrid offline policy: register a best-effort service worker for app-shell +
// fixture caching. Fonts/images may still come from the network on first load;
// see public/sw.js and README for the path to fully-local assets.
if ("serviceWorker" in navigator) {
  // Whether a SW already controls this load — used to auto-reload only on a REAL
  // update (not the first-ever install).
  const hadController = !!navigator.serviceWorker.controller;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      // updateViaCache:"none" stops the browser from serving a stale sw.js from its
      // HTTP cache, so update checks actually see new deploys.
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // Proactively check for a new build on launch and whenever the app is
        // brought back to the foreground (iOS PWAs otherwise rarely re-check).
        const check = () => { reg.update().catch(() => {}); };
        check();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        // A new build finished installing while a SW already controlled the page →
        // tell it to activate immediately (also surfaces the reload banner).
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage?.({ type: "SKIP_WAITING" });
              window.dispatchEvent(new CustomEvent("indigold:sw-update"));
            }
          });
        });
      })
      .catch(() => {
        /* offline-first is best-effort; ignore registration failures */
      });

    // When the new SW takes control, reload ONCE so the page runs the fresh HTML+JS
    // automatically — no manual reinstall. (Guarded so the first-ever install, and
    // repeat controllerchanges, don't loop.)
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.dispatchEvent(new CustomEvent("indigold:sw-update"));
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
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
