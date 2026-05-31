import { Router } from "express";
import { dbHealthy } from "@indigold/db";
import { redisHealthy, queueDepth } from "@indigold/shared";

export const health = Router();

// Liveness — always 200 if the process is up.
health.get("/health", (_req, res) => res.json({ ok: true, service: "indigold-api" }));

// Readiness — checks dependencies.
health.get("/ready", async (_req, res) => {
  const [db, kv] = await Promise.all([dbHealthy(), redisHealthy()]);
  let depth = -1;
  try {
    depth = await queueDepth();
  } catch {
    /* ignore */
  }
  const ready = db && kv;
  res.status(ready ? 200 : 503).json({ ready, db, kv, queueDepth: depth });
});
