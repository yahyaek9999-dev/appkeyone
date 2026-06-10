/**
 * lib/scaling-flags.ts — Feature flags for smart scaling optimizations.
 *
 * All optimizations are gated behind these flags. Disabled by default.
 * Enable via environment variables for gradual rollout + instant rollback.
 *
 * Usage:
 *   import { scalingFlags } from "@/lib/scaling-flags";
 *   if (scalingFlags.sessionHibernation) { ... }
 */

function flag(key: string): boolean {
  return process.env[key] === "1";
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

export const scalingFlags = {
  /** Smart session hibernation — wake-on-demand WhatsApp sessions */
  get sessionHibernation(): boolean {
    return flag("ENABLE_SESSION_HIBERNATION");
  },

  /** SSE snapshot cache — shared per-user snapshot with TTL */
  get snapshotCache(): boolean {
    return flag("ENABLE_SNAPSHOT_CACHE");
  },

  /** Message coalescing — merge rapid-fire messages before AI processing */
  get messageCoalescing(): boolean {
    return flag("ENABLE_MESSAGE_COALESCING");
  },

  /** Chromium resource optimization — disable images/media/tracking in Puppeteer */
  get chromiumOptimization(): boolean {
    return flag("ENABLE_CHROMIUM_OPTIMIZATION");
  },

  /** Background job offloading — batch non-critical DB writes */
  get backgroundOffloading(): boolean {
    return flag("ENABLE_BACKGROUND_OFFLOADING");
  },

  /**
   * Route the live WhatsApp AI reply through the universal provider registry
   * (vault → legacy → keyone failover). Default OFF → pure legacy path, byte-
   * identical to today. Global kill-switch: set WA_AI_REGISTRY_ENABLED=0 (+
   * restart) to revert all tenants to legacy. Per-tenant enablement is intrinsic
   * (a tenant uses the registry only when they have enabled vault AI credentials).
   */
  get waAiRegistry(): boolean {
    return flag("WA_AI_REGISTRY_ENABLED");
  },

  // ---------------------------------------------------------------------------
  // Tunables (env-overridable with sane defaults)
  // ---------------------------------------------------------------------------

  /** Session hibernation: idle timeout before sleep (minutes) */
  get hibernateIdleMinutes(): number {
    return num("HIBERNATE_IDLE_MINUTES", 30);
  },

  /** Session hibernation: max active Chromium sessions (overrides WA_MAX_SESSIONS when hibernation is on) */
  get hibernateMaxActive(): number {
    return num("HIBERNATE_MAX_ACTIVE", 4);
  },

  /** Session hibernation: max queued wake requests at once (prevents reconnect storms) */
  get hibernateMaxConcurrentWakes(): number {
    return num("HIBERNATE_MAX_CONCURRENT_WAKES", 2);
  },

  /** Session hibernation: wake timeout in seconds */
  get hibernateWakeTimeoutSec(): number {
    return num("HIBERNATE_WAKE_TIMEOUT_SEC", 20);
  },

  /** SSE snapshot cache TTL in milliseconds */
  get snapshotCacheTtlMs(): number {
    return num("SNAPSHOT_CACHE_TTL_MS", 4000);
  },

  /** Message coalescing window in milliseconds */
  get coalesceWindowMs(): number {
    return num("COALESCE_WINDOW_MS", 3000);
  },

  /** Message coalescing max messages to merge */
  get coalesceMaxMessages(): number {
    return num("COALESCE_MAX_MESSAGES", 5);
  },
} as const;

export type ScalingFlags = typeof scalingFlags;
