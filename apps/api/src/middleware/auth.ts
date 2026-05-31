import type { Request, Response, NextFunction } from "express";
import { getSession } from "@indigold/shared";

export interface Authed extends Request {
  userId?: string;
  email?: string;
}

export async function requireAuth(req: Authed, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const tok = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!tok) return res.status(401).json({ error: "unauthenticated" });
  try {
    const sess = await getSession<{ userId: string; email: string }>(tok);
    if (!sess) return res.status(401).json({ error: "invalid_session" });
    req.userId = sess.userId;
    req.email = sess.email;
    next();
  } catch {
    return res.status(503).json({ error: "session_store_unavailable" });
  }
}
