import express from "express";
import cors from "cors";
import { migrate } from "@indigold/db";
import { health } from "./routes/health";
import authRoutes from "./routes/auth";
import { capturesRouter, nodesRouter, edgesRouter, timelineRouter } from "./routes/data";
import { contextRouter, briefsRouter, usageRouter } from "./routes/intelligence";
import { ioRouter } from "./routes/io";
import { requireAuth } from "./middleware/auth";
import { limit } from "./middleware/ratelimit";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

const origins = (process.env.PWA_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));

// health/readiness must not depend on the rate limiter or KV
app.use("/", health);

// global soft limiter (per IP/user)
app.use(limit(Number(process.env.RATE_LIMIT_MAX || 300), Number(process.env.RATE_LIMIT_WINDOW || 60)));

app.use("/auth", limit(20, 60), authRoutes);

// authenticated surface
app.use("/captures", requireAuth, capturesRouter);
app.use("/nodes", requireAuth, nodesRouter);
app.use("/edges", requireAuth, edgesRouter);
app.use("/timeline", requireAuth, timelineRouter);
app.use("/context-packs", requireAuth, contextRouter);
app.use("/briefs", requireAuth, briefsRouter);
app.use("/usage", requireAuth, usageRouter);
app.use("/", requireAuth, ioRouter);

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

const port = Number(process.env.PORT || 7000);

async function boot() {
  if (process.env.RUN_MIGRATIONS !== "false") {
    try {
      await migrate();
    } catch (e) {
      console.error("[api] migration skipped/failed:", (e as Error).message);
    }
  }
  app.listen(port, () => console.log(`[indigold-api] listening on :${port}`));
}
boot();
