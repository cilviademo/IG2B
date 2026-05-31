// Single shared ioredis connection (Render "Key Value"). Lazy + resilient.
import Redis from "ioredis";

let client: Redis | null = null;

export function redis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
    client = new Redis(url, {
      // Fail commands fast when disconnected so callers can degrade gracefully
      // (rate-limit/session middleware "fail open") instead of hanging forever.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on("error", (e: Error) => console.error("[redis] error:", e.message));
  }
  return client;
}

export async function redisHealthy(): Promise<boolean> {
  try {
    const pong = await redis().ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
