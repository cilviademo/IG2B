/* Production static server (compatibility placeholder).
 * Serves the built client from dist/public with SPA fallback.
 * Dev uses Vite directly (`pnpm dev`); this file is only for `pnpm start`.
 * It does NOT connect to any database or external service in v0.1. */
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(dirname, "..", "dist", "public");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.static(distPath));

// SPA fallback — serve index.html for any non-file route.
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Indigold static server on http://localhost:${port}`);
});
