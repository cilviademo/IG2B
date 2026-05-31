import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// NOTE: Manus-specific plugins from the original template are intentionally
// omitted here (not available in this environment). Do not re-add tooling that
// requires external services. Root is `client/`; build emits to `dist/public`.
export default defineConfig({
  root: path.resolve(dirname, "client"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "client/src"),
      "@shared": path.resolve(dirname, "shared"),
    },
  },
  build: {
    outDir: path.resolve(dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: true,
  },
});
