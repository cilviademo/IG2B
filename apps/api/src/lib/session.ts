// Durable sessions: Redis is the fast cache, Postgres is the backstop so a token
// survives Redis free-tier LRU eviction (BUG-003). Read Redis-first, fall back to
// Postgres and re-warm the cache. All writes go to both; failures never throw.
import { setSession, getSession, delSession } from "@indigold/shared";
import * as repo from "@indigold/db";

const TTL_SEC = 60 * 60 * 24 * 7; // 7 days, matching the Redis session TTL

export interface SessionData { userId: string; email: string }

export async function putSession(token: string, data: SessionData): Promise<void> {
  await setSession(token, data, TTL_SEC); // fast path (cache)
  try {
    await repo.sessions.put(token, data.userId, data.email, TTL_SEC); // durable backstop
  } catch {
    /* DB unavailable — Redis still holds the session; don't fail auth */
  }
}

export async function readSession(token: string): Promise<SessionData | null> {
  const cached = await getSession<SessionData>(token);
  if (cached) return cached;
  try {
    const row = await repo.sessions.get(token);
    if (row) {
      const data: SessionData = { userId: row.user_id, email: row.email };
      await setSession(token, data, TTL_SEC).catch(() => {}); // re-warm cache
      return data;
    }
  } catch {
    /* DB unavailable — treat as no session */
  }
  return null;
}

export async function dropSession(token: string): Promise<void> {
  await delSession(token).catch(() => {});
  try {
    await repo.sessions.del(token);
  } catch {
    /* best-effort */
  }
}
