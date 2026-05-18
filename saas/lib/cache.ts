/**
 * Application-level caching helpers built on top of lib/redis.ts.
 *
 * Pattern:
 *   const data = await cached(cacheKey.usageSummary(userId), TTL.USAGE, () => fetchFromDB());
 *
 * Invalidation:
 *   await invalidate(cacheKey.usageSummary(userId));
 *
 * All helpers fail-open: a Redis outage never prevents the underlying fetch
 * from running. Cache misses and errors are both treated as "go fetch".
 */

import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// TTL constants (in seconds)
// ---------------------------------------------------------------------------

export const TTL = {
  /** Short-lived data that changes often (rate-limit windows, live counters). */
  SHORT:       60,          // 1 minute
  /** Standard cache for computed views that are cheap to rebuild. */
  STANDARD:    5 * 60,      // 5 minutes
  /** Usage summaries — refresh after writes via invalidation. */
  USAGE:       2 * 60,      // 2 minutes (stale ok; invalidated on increment)
  /** Plan limits — rarely change; long TTL is fine. */
  PLAN:        15 * 60,     // 15 minutes
  /** Bot configuration — invalidated when the bot is saved. */
  BOT:         5 * 60,      // 5 minutes
  /** Customer profile — invalidated on update. */
  CUSTOMER:    3 * 60,      // 3 minutes
  /** Heavy analytics / aggregates that are expensive to recompute. */
  ANALYTICS:   10 * 60,     // 10 minutes
  /** Session / auth data. */
  SESSION:     60 * 60,     // 1 hour
  /** Rarely-changing reference data (plans list, site config). */
  REFERENCE:   30 * 60,     // 30 minutes
  /** LLM response cache (matches Bot.cacheTtlHours default of 24h). */
  LLM_REPLY:   24 * 60 * 60, // 24 hours
} as const;

export type TtlName = keyof typeof TTL;

// ---------------------------------------------------------------------------
// Cache key factory — keeps all key strings in one place to avoid typos
// ---------------------------------------------------------------------------

export const cacheKey = {
  // Membership & usage
  usageSummary:  (userId: string)  => `keyone:usage:${userId}`,
  planLimits:    (slug: string)    => `keyone:plan:${slug}`,
  effectivePlan: (userId: string)  => `keyone:effective_plan:${userId}`,
  subscription:  (userId: string)  => `keyone:sub:${userId}`,

  // Bot / AI
  botConfig:     (userId: string)  => `keyone:bot:${userId}`,
  llmReply:      (botId: string, qHash: string) => `keyone:llm:${botId}:${qHash}`,

  // Customers
  customer:      (id: string)      => `keyone:customer:${id}`,
  customerByPhone: (userId: string, phone: string) =>
    `keyone:customer_phone:${userId}:${phone}`,

  // Broadcasts
  broadcastStatus: (id: string)   => `keyone:bc:status:${id}`,

  // Analytics / dashboards
  analytics:     (userId: string, day: string) => `keyone:analytics:${userId}:${day}`,
  globalMetrics: (day: string)    => `keyone:metrics:global:${day}`,

  // Rate limiting
  rateLimit:     (userId: string, window: string) => `keyone:rl:${userId}:${window}`,
  rateLimitIp:   (ip: string, window: string)     => `keyone:rl:ip:${ip}:${window}`,

  // Site config (singleton)
  siteConfig:    ()               => `keyone:site_config`,

  // Knowledge base / documents
  kbDocs:        (userId: string) => `keyone:kb:${userId}`,

  /** Generic namespaced key — escape hatch for one-off keys. */
  custom:        (ns: string, ...parts: string[]) => `keyone:${ns}:${parts.join(":")}`,
} as const;

// ---------------------------------------------------------------------------
// Core cached() function
// ---------------------------------------------------------------------------

/**
 * Stale-while-revalidate style cache wrapper.
 *
 * 1. Returns the cached value if present (fast path).
 * 2. On miss, calls `fetcher()`, writes the result to Redis, and returns it.
 * 3. On any Redis error, falls through to `fetcher()` so the app keeps working.
 *
 * @param key       - Redis key (use cacheKey.* helpers)
 * @param ttl       - TTL in seconds (use TTL.* constants)
 * @param fetcher   - Async function that returns the canonical value
 */
export async function cached<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // 1. Try cache
  try {
    const hit = await redis.get<T>(key);
    if (hit !== null) return hit;
  } catch {
    // Redis unavailable — skip cache, go to DB
  }

  // 2. Fetch canonical value
  const value = await fetcher();

  // 3. Write back to cache (best-effort, fire-and-forget)
  redis.set(key, value, ttl).catch((e) => {
    console.warn("[cache] write-back failed for key", key, e);
  });

  return value;
}

// ---------------------------------------------------------------------------
// Invalidation helpers
// ---------------------------------------------------------------------------

/**
 * Delete one or more cache keys immediately.
 * Typically called after a DB write that makes the cached value stale.
 *
 * @example
 *   await invalidate(cacheKey.usageSummary(userId), cacheKey.effectivePlan(userId));
 */
export async function invalidate(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await redis.del(...keys);
}

/**
 * Invalidate all cache keys related to a specific user.
 * Use after subscription changes, plan upgrades, or suspension.
 */
export async function invalidateUser(userId: string): Promise<void> {
  await invalidate(
    cacheKey.usageSummary(userId),
    cacheKey.effectivePlan(userId),
    cacheKey.subscription(userId),
    cacheKey.botConfig(userId)
  );
}

/**
 * Invalidate cache keys related to a plan.
 */
export async function invalidatePlan(slug: string): Promise<void> {
  await invalidate(cacheKey.planLimits(slug));
}

// ---------------------------------------------------------------------------
// Typed convenience wrappers (narrow the generic for common hot paths)
// ---------------------------------------------------------------------------

/**
 * Cache a usage summary (msgsUsed, aiRequestsUsed, broadcastsUsed, etc.).
 * Short TTL + explicit invalidation after incrementUsage() calls.
 */
export async function cachedUsage<T extends object>(
  userId: string,
  fetcher: () => Promise<T>
): Promise<T> {
  return cached(cacheKey.usageSummary(userId), TTL.USAGE, fetcher);
}

/**
 * Cache the effective plan for a user (plan limits + feature flags).
 * Invalidated when the subscription or plan row changes.
 */
export async function cachedPlan<T extends object>(
  userId: string,
  fetcher: () => Promise<T>
): Promise<T> {
  return cached(cacheKey.effectivePlan(userId), TTL.PLAN, fetcher);
}

/**
 * Cache bot configuration.
 */
export async function cachedBot<T extends object>(
  userId: string,
  fetcher: () => Promise<T>
): Promise<T> {
  return cached(cacheKey.botConfig(userId), TTL.BOT, fetcher);
}

/**
 * Cache the site-wide SiteConfig singleton.
 */
export async function cachedSiteConfig<T extends object>(
  fetcher: () => Promise<T>
): Promise<T> {
  return cached(cacheKey.siteConfig(), TTL.REFERENCE, fetcher);
}
