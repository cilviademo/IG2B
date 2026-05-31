// Key-Value helpers: sessions, rate limits, token/API usage, generic cache.
import { redis } from "./redis";

const SESSION_PREFIX = "sess:";
const USAGE_PREFIX = "usage:";

export async function setSession(token: string, data: object, ttlSec = 60 * 60 * 24 * 7) {
  await redis().set(SESSION_PREFIX + token, JSON.stringify(data), "EX", ttlSec);
}
export async function getSession<T = Record<string, unknown>>(token: string): Promise<T | null> {
  const raw = await redis().get(SESSION_PREFIX + token);
  return raw ? (JSON.parse(raw) as T) : null;
}
export async function delSession(token: string) {
  await redis().del(SESSION_PREFIX + token);
}

/** Fixed-window rate limit. Returns whether the call is allowed + remaining. */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const k = `rl:${key}`;
  const n = await redis().incr(k);
  if (n === 1) await redis().expire(k, windowSec);
  return { allowed: n <= limit, remaining: Math.max(0, limit - n), count: n };
}

/** Token / API / cost usage counters per user per UTC day (the token budget state). */
export async function addUsage(
  userId: string,
  delta: { tokens?: number; apiCalls?: number; costCents?: number },
) {
  const day = new Date().toISOString().slice(0, 10);
  const k = `${USAGE_PREFIX}${userId}:${day}`;
  const r = redis();
  const pipe = r.pipeline();
  if (delta.tokens) pipe.hincrby(k, "tokens", delta.tokens);
  if (delta.apiCalls) pipe.hincrby(k, "apiCalls", delta.apiCalls);
  if (delta.costCents) pipe.hincrby(k, "costCents", delta.costCents);
  pipe.expire(k, 60 * 60 * 24 * 35);
  await pipe.exec();
}
export async function getUsage(userId: string, day = new Date().toISOString().slice(0, 10)) {
  const h = await redis().hgetall(`${USAGE_PREFIX}${userId}:${day}`);
  return {
    day,
    tokens: Number(h.tokens || 0),
    apiCalls: Number(h.apiCalls || 0),
    costCents: Number(h.costCents || 0),
  };
}

/** Returns true if the user is within their daily token budget. */
export async function withinTokenBudget(userId: string, dailyTokenBudget: number) {
  const { tokens } = await getUsage(userId);
  return tokens < dailyTokenBudget;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis().get("cache:" + key);
  return raw ? (JSON.parse(raw) as T) : null;
}
export async function cacheSet(key: string, value: unknown, ttlSec = 300) {
  await redis().set("cache:" + key, JSON.stringify(value), "EX", ttlSec);
}
