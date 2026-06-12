import express from "express";
import cors from "cors";
import { migrate } from "@indigold/db";
import { health } from "./routes/health";
import authRoutes from "./routes/auth";
import { capturesRouter, nodesRouter, edgesRouter, timelineRouter } from "./routes/data";
import { contextRouter, briefsRouter, usageRouter } from "./routes/intelligence";
import { ioRouter } from "./routes/io";
import { uploadRouter } from "./routes/upload";
import { projectsRouter, radianRouter } from "./routes/radian";
import { requireAuth } from "./middleware/auth";
import { limit } from "./middleware/ratelimit";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

// CORS: the PWA and API are SEPARATE Render services, so the API must allow the
// PWA's cross-origin requests (Authorization header on POST). Bearer-header auth
// (no cookies), so credentials are not needed. Allow: no-Origin (curl/health),
// the configured PWA origin(s), and the user's own *.onrender.com deployments —
// this covers a host suffix/rename mismatch, the typical "couldn't reach" cause.
const configuredOrigins = (process.env.PWA_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((o) => (/^https?:\/\//.test(o) ? o : `https://${o}`));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl, server-to-server, health checks
      if (configuredOrigins.includes(origin)) return cb(null, true);
      try {
        if (new URL(origin).hostname.endsWith(".onrender.com")) return cb(null, true);
      } catch {
        /* malformed origin -> deny */
      }
      return cb(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

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
app.use("/projects", requireAuth, projectsRouter);
app.use("/radian", requireAuth, radianRouter);
// File upload (multipart) + signed asset URLs. requireAuth rejects anonymous
// requests; busboy reads the raw stream (express.json ignores multipart bodies).
app.use("/", requireAuth, uploadRouter);
app.use("/", requireAuth, ioRouter);

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

const port = Number(process.env.PORT || 7000);

// EMBEDDED mode (low-cost single service): optionally run the job worker and the
// self-scheduler inside this process. SCALED mode runs them as their own services.
async function startEmbedded() {
  if (process.env.RUN_WORKER === "true") {
    const [{ consume }, { handlers }] = await Promise.all([
      import("@indigold/shared"),
      import("../../worker/src/jobs/handlers"),
    ]);
    consume(
      async (job) => {
        const h = handlers[job.type];
        if (h) await h(job);
      },
      { onError: (e, job) => console.error(`[api/worker] ${job?.type} failed:`, (e as Error)?.message) },
    ).catch((e) => console.error("[api/worker] fatal:", e));
    console.log("[indigold-api] embedded worker started");
  }
  if (process.env.RUN_SCHEDULER === "true") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}

async function boot() {
  if (process.env.RUN_MIGRATIONS !== "false") {
    try {
      await migrate();
    } catch (e) {
      console.error("[api] migration skipped/failed:", (e as Error).message);
    }
  }
  // PII safeguard: if storage is configured, refuse to serve uploads from a
  // public location. A tripped guard logs loudly but doesn't crash the API
  // (uploads return 503/500; everything else keeps working).
  try {
    const { storageConfigured, assertPrivateOrThrow } = await import("./lib/storage");
    if (storageConfigured()) await assertPrivateOrThrow();
  } catch (e) {
    console.error("[api] STORAGE GUARD:", (e as Error).message);
  }

  app.listen(port, () => console.log(`[indigold-api] listening on :${port}`));
  await startEmbedded();
}
boot();
