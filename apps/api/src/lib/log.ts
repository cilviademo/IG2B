// Structured JSON logging — one line per event, greppable, no dependency. Observability item
// from the Codex audit. PRIVACY (constraint #4): callers pass only explicit, safe fields; the
// request logger records method + path + status + latency, never the query string, body, headers,
// or any secret. Level gated by LOG_LEVEL (info|warn|error; default info).
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

type Level = "info" | "warn" | "error";
const ORDER: Record<Level, number> = { info: 0, warn: 1, error: 2 };
const MIN: Level = (["info", "warn", "error"].includes(process.env.LOG_LEVEL || "") ? process.env.LOG_LEVEL : "info") as Level;

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < ORDER[MIN]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
};

// Express request logger — attaches/propagates an x-request-id and logs the request on finish.
// Skips the unauthenticated /health probe (noise). Never logs query/body/headers.
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/health") return next();
  const id = (req.headers["x-request-id"] as string) || randomUUID();
  res.setHeader("x-request-id", id);
  const start = Date.now();
  res.on("finish", () => {
    const level: Level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    emit(level, "request", { id, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
  });
  next();
}
