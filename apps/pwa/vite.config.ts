import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Static Site: root is apps/pwa, output to dist (Render Publish Directory).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(dirname, "src") } },
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 3000, host: true },
});
