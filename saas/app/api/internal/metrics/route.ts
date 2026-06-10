// ---------------------------------------------------------------------------
// GET /api/internal/metrics — Aggregated system metrics (Phase 7)
//
// INTERNAL endpoint — requires the `x-internal-secret` request header to
// match the `SAAS_INTERNAL_SECRET` environment variable. Cron jobs, the
// ops dashboard, and monitoring agents use this endpoint.
//
// Design rules:
//   - Every DB query catches its own error and returns 0 on failure.
//     This endpoint MUST NOT crash — a metric being 0 is always better
//     than a 500 that hides all the other metrics.
//   - Redis reachability is checked via Upstash REST API if configured.
//     Falls back to { reachable: false, reason: "not_configured" } safely.
//   - Response is never cached.
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { prisma } from "@/lib/db";
import { checkInternalSecret } from "@/lib/internal-auth";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

// ---------------------------------------------------------------------------
// Safe query helpers — each returns a numeric value or 0 on any error
// ---------------------------------------------------------------------------

async function countUsers(): Promise<number> {
  return prisma.user.count().catch(() => 0);
}

async function countBots(): Promise<number> {
  return prisma.bot.count().catch(() => 0);
}

async function countActiveSubscriptions(): Promise<number> {
  return prisma.subscription
    .count({ where: { status: "active" } })
    .catch(() => 0);
}

async function countMessages24h(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.message
    .count({ where: { createdAt: { gte: since } } })
    .catch(() => 0);
}

/** Broadcasts currently in the queue (queued + sending = active depth) */
async function countBroadcastQueueDepth(): Promise<number> {
  return prisma.broadcast
    .count({ where: { status: { in: ["queued", "sending"] } } })
    .catch(() => 0);
}

// ---------------------------------------------------------------------------
// Optional Redis reachability via Upstash REST API
//
// Upstash exposes a simple HTTP REST endpoint: GET /ping returns PONG.
// We use native fetch (available in Node.js 18+) so there's no extra dep.
// If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not configured
// we report the instance as not_configured rather than unreachable.
// ---------------------------------------------------------------------------
type RedisHealth =
  | { reachable: true; latencyMs: number }
  | { reachable: false; reason: string };

async function checkRedis(): Promise<RedisHealth> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return { reachable: false, reason: "not_configured" };
  }

  try {
    const t0 = Date.now();
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3_000), // 3-second deadline
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) return { reachable: true, latencyMs };
    return { reachable: false, reason: `http_${res.status}` };
  } catch (err: unknown) {
    return {
      reachable: false,
      reason: (err as Error)?.message?.slice(0, 80) ?? "fetch_error",
    };
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  // Auth check — must come first before any DB queries
  if (!checkInternalSecret(req)) {
    return unauthorized();
  }

  // Fire all queries concurrently — independent of each other
  const [users, bots, activeSubs, msgs24h, broadcastQueueDepth, redis] =
    await Promise.all([
      countUsers(),
      countBots(),
      countActiveSubscriptions(),
      countMessages24h(),
      countBroadcastQueueDepth(),
      checkRedis(),
    ]);

  return Response.json(
    {
      db: {
        users,
        bots,
        activeSubs,
        msgs24h,
        broadcastQueueDepth,
      },
      redis,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-cache, no-store" },
    }
  );
}
