import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "@indigold/shared";

/** Fixed-window limiter keyed by user (if present) or client IP. */
export function limit(max: number, windowSec: number) {
  return async (req: Request & { userId?: string }, res: Response, next: NextFunction) => {
    const key = req.userId || req.ip || "anon";
    try {
      const { allowed, remaining } = await rateLimit(`${req.path}:${key}`, max, windowSec);
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      if (!allowed) return res.status(429).json({ error: "rate_limited" });
      next();
    } catch {
      // fail open if the KV store is briefly unavailable
      next();
    }
  };
}
