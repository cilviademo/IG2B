import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import * as repo from "@indigold/db";
import { tokenHasScope } from "@indigold/shared";
import { readSession } from "../lib/session";

export interface Authed extends Request {
  userId?: string;
  email?: string;
  captureOnly?: boolean; // true when authed via a scoped capture token (Finding A)
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function requireAuth(req: Authed, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const tok = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!tok) return res.status(401).json({ error: "unauthenticated" });
  try {
    const sess = await readSession(tok);
    if (!sess) return res.status(401).json({ error: "invalid_session" });
    req.userId = sess.userId;
    req.email = sess.email;
    next();
  } catch {
    return res.status(503).json({ error: "session_store_unavailable" });
  }
}

// Accept EITHER a full session (any owner action) OR a scoped capture token carrying `scope`.
// Used ONLY on the capture-ingest endpoints. A capture token authenticates here and NOWHERE
// else — every other route uses `requireAuth` (session-only), so a leaked capture token can do
// nothing but create captures (Security review, Finding A).
export function requireAuthOrCapture(scope: string) {
  return async (req: Authed, res: Response, next: NextFunction) => {
    const header = req.header("authorization") || "";
    const tok = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!tok) return res.status(401).json({ error: "unauthenticated" });
    try {
      const sess = await readSession(tok);
      if (sess) { req.userId = sess.userId; req.email = sess.email; return next(); }
    } catch {
      return res.status(503).json({ error: "session_store_unavailable" });
    }
    try {
      const ct = await repo.captureTokens.findActiveByHash(sha256(tok));
      if (ct && tokenHasScope(ct.scopes, scope)) {
        req.userId = ct.user_id;
        req.captureOnly = true;
        void repo.captureTokens.touch(ct.id);
        return next();
      }
    } catch {
      /* fall through to 401 */
    }
    return res.status(401).json({ error: "invalid_token" });
  };
}
