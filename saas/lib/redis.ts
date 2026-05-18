/**
 * Redis client — Upstash REST interface.
 * Used for: caching, rate limiting, pub/sub (via polling), session data.
 *
 * This uses the @upstash/redis HTTP client — works in Next.js server
 * components, route handlers, middleware, and edge runtime.
 *
 * For BullMQ (queue workers), use the ioredis connection in queue.ts.
 */
import { Redis } from "@upstash/redis";

// Singleton — safe to call at module level in Next.js
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // Graceful degradation in dev without Redis
    if (process.env.NODE_ENV !== "production") {
      // Return a no-op stub that never throws
      return createNoopRedis() as unknown as Redis;
    }
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required"
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// No-op stub for dev/test environments without Redis configured
function createNoopRedis(): any {
  return {
    get: async () => null,
    set: async () => "OK",
    setex: async () => "OK",
    del: async () => 0,
    exists: async () => 0,
    incr: async () => 1,
    expire: async () => 1,
    ping: async () => "PONG",
  };
}

export const redis = {
  /** Get a cached value. Returns null on miss. */
  get: async <T>(key: string): Promise<T | null> => {
    try {
      return await getRedis().get<T>(key);
    } catch (e) {
      console.warn("[redis] get failed:", e);
      return null;
    }
  },

  /** Set with optional TTL in seconds. */
  set: async (
    key: string,
    value: unknown,
    ttlSeconds?: number
  ): Promise<void> => {
    try {
      const r = getRedis();
      if (ttlSeconds) {
        await r.setex(key, ttlSeconds, value as any);
      } else {
        await r.set(key, value as any);
      }
    } catch (e) {
      console.warn("[redis] set failed:", e);
    }
  },

  /** Delete one or more keys. */
  del: async (...keys: string[]): Promise<void> => {
    try {
      await getRedis().del(...keys);
    } catch (e) {
      console.warn("[redis] del failed:", e);
    }
  },

  /** Increment a counter. Returns the new value (0 on error). */
  incr: async (key: string): Promise<number> => {
    try {
      return (await getRedis().incr(key)) as number;
    } catch (e) {
      console.warn("[redis] incr failed:", e);
      return 0;
    }
  },

  /** Set TTL on an existing key. */
  expire: async (key: string, ttlSeconds: number): Promise<void> => {
    try {
      await getRedis().expire(key, ttlSeconds);
    } catch (e) {
      console.warn("[redis] expire failed:", e);
    }
  },

  /** Health check. Returns true if Redis is reachable. */
  ping: async (): Promise<boolean> => {
    try {
      const r = await getRedis().ping();
      return r === "PONG";
    } catch {
      return false;
    }
  },
};
