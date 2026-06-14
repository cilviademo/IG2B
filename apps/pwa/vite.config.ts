import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Build identity — injected so the running PWA can show exactly which build/commit
// it is (the Debug/Sync panel + the "new version" check). Render sets
// RENDER_GIT_COMMIT; locally we read git; either way fall back to "dev".
function buildCommit(): string {
  const env = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.VITE_BUILD_COMMIT;
  if (env) return env.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { cwd: dirname }).toString().trim();
  } catch {
    return "dev";
  }
}

// Static Site: root is apps/pwa, output to dist (Render Publish Directory).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(dirname, "src") } },
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 3000, host: true },
});
