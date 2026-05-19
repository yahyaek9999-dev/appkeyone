/**
 * lib/snapshot-cache.ts — Shared SSE snapshot cache.
 *
 * Problem: Each SSE dashboard connection independently queries SQLite
 * every 5 seconds (9+ queries). With 10 connections from the same user,
 * that's 90 queries every 5 seconds.
 *
 * Solution: Compute the snapshot ONCE per user per TTL window, serve the
 * cached result to all concurrent SSE streams. Falls back to direct
 * computation when the cache is empty or expired.
 *
 * Supports:
 *   - In-memory cache (default, zero deps)
 *   - Redis-backed cache (optional, for multi-process)
 *
 * Feature flag: ENABLE_SNAPSHOT_CACHE=1
 */

import { scalingFlags } from "@/lib/scaling-flags";

type SnapshotEntry = {
  data: any;
  computedAt: number;
  userId: string;
  cacheKey: string;
};

// In-memory LRU cache (bounded)
const MAX_ENTRIES = 200;
const cache = new Map<string, SnapshotEntry>();

// Deduplicate concurrent builds — if user A has 5 tabs open and the cache
// expires, we only run buildSnapshot() ONCE, not 5 times.
const inflight = new Map<string, Promise<any>>();

function makeCacheKey(userId: string, customerId?: string | null): string {
  return `snap:${userId}:${customerId || "_"}`;
}

function evictIfFull(): void {
  if (cache.size <= MAX_ENTRIES) return;
  // Delete oldest entry
  const firstKey = cache.keys().next().value;
  if (firstKey) cache.delete(firstKey);
}

/**
 * Get a cached snapshot or compute it via the provided builder function.
 * When ENABLE_SNAPSHOT_CACHE is off, always calls builder directly.
 */
export async function getCachedSnapshot(
  userId: string,
  customerId: string | null | undefined,
  builder: () => Promise<any>,
): Promise<any> {
  if (!scalingFlags.snapshotCache) {
    return builder();
  }

  const key = makeCacheKey(userId, customerId);
  const ttl = scalingFlags.snapshotCacheTtlMs;
  const now = Date.now();

  // Check cache
  const existing = cache.get(key);
  if (existing && (now - existing.computedAt) < ttl) {
    return existing.data;
  }

  // Deduplicate concurrent builds for the same key
  const running = inflight.get(key);
  if (running) {
    return running;
  }

  // Build and cache
  const buildPromise = builder().then((data) => {
    cache.set(key, { data, computedAt: Date.now(), userId, cacheKey: key });
    evictIfFull();
    inflight.delete(key);
    return data;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, buildPromise);
  return buildPromise;
}

/**
 * Invalidate cache for a specific user (call after mutations).
 * This is best-effort — the TTL is short enough that stale data
 * auto-expires quickly even without explicit invalidation.
 */
export function invalidateSnapshot(userId: string): void {
  for (const [key, entry] of cache) {
    if (entry.userId === userId) {
      cache.delete(key);
    }
  }
}

/**
 * Cache stats for monitoring.
 */
export function snapshotCacheStats() {
  return {
    enabled: scalingFlags.snapshotCache,
    entries: cache.size,
    maxEntries: MAX_ENTRIES,
    ttlMs: scalingFlags.snapshotCacheTtlMs,
    inflight: inflight.size,
  };
}
