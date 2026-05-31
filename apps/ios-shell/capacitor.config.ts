import type { CapacitorConfig } from "@capacitor/cli";

// Thin native shell that loads the live Indigold PWA. The Share Extension (see
// ios-share-extension/) forwards shared content as indigold://share?… ; the PWA's
// appUrlOpen bridge (apps/pwa/src/main.tsx) routes it to /share for auto-capture.
const config: CapacitorConfig = {
  appId: "com.indigold.app",
  appName: "Indigold",
  webDir: "www", // placeholder; the app loads server.url below
  server: {
    // Point at your deployed PWA. Update if your Render host differs.
    url: "https://indigold-pwa.onrender.com",
    cleartext: false,
  },
  ios: {
    // custom scheme used by the Share Extension to open the app
    scheme: "Indigold",
  },
};

export default config;
