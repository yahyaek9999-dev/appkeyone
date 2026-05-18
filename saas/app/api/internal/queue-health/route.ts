// ---------------------------------------------------------------------------
// GET /api/internal/queue-health — BullMQ / cron queue diagnostics (Phase 7)
//
// INTERNAL endpoint — requires the `x-internal-secret` header.
//
// Behaviour:
//   - ENABLE_BULLMQ=0 (default) → returns { bullmq: "disabled", cron: "active" }
//     because the project currently uses plain HTTP cron routes (not BullMQ).
//   - ENABLE_BULLMQ=1           → attempts to connect to the BullMQ queues via
//     UPSTASH_REDIS_URL and returns waiting/active/completed/failed counts.
//
// BullMQ is imported dynamically inside a try/catch because:
//   1. The package may not yet be installed (npm i bullmq is optional).
//   2. The Edge runtime does not support Node.js TCP sockets.
//
// This endpoint NEVER throws — all errors surface as `error` fields in the
// JSON body with HTTP 200. Monitors read the payload, not the status code.
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------
const SECRET = process.env.SAAS_INTERNAL_SECRET ?? "";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

// ---------------------------------------------------------------------------
// Queue names used by the project's cron / BullMQ workers
// ---------------------------------------------------------------------------
const QUEUE_NAMES = [
  "broadcasts",
  "follow-ups",
  "daily-report",
  "meta-webhook-processor",
  "llm-prewarm",
] as const;

type QueueName = (typeof QUEUE_NAMES)[number];

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

// ---------------------------------------------------------------------------
// BullMQ queue inspection
//
// Wrapped in its own async function so the top-level handler stays clean.
// If BullMQ is not installed, `import("bullmq")` throws a MODULE_NOT_FOUND
// error which we catch and surface without crashing.
// ---------------------------------------------------------------------------
async function getBullMQStats(): Promise<
  | { ok: true; queues: Record<QueueName, QueueStats> }
  | { ok: false; error: string }
> {
  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) {
    return { ok: false, error: "UPSTASH_REDIS_URL is not set" };
  }

  try {
    // Dynamic import — safe even when the package is absent.
    const bullmq = await import("bullmq").catch(() => {
      throw new Error("bullmq package is not installed");
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Queue = bullmq.Queue as any;

    // Parse the Upstash Redis URL into an ioredis connection config.
    // Upstash URLs are redis(s)://:password@host:port — BullMQ accepts a URL.
    const results = {} as Record<QueueName, QueueStats>;

    await Promise.all(
      QUEUE_NAMES.map(async (name) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = null;
        try {
          q = new Queue(name, {
            connection: { url: redisUrl },
            // Don't create the queue if it doesn't exist yet
          });

          const [waiting, active, completed, failed, delayed] =
            await Promise.all([
              q.getWaitingCount().catch(() => 0),
              q.getActiveCount().catch(() => 0),
              q.getCompletedCount().catch(() => 0),
              q.getFailedCount().catch(() => 0),
              q.getDelayedCount().catch(() => 0),
            ]);

          results[name] = { waiting, active, completed, failed, delayed };
        } catch {
          results[name] = {
            waiting: -1,
            active: -1,
            completed: -1,
            failed: -1,
            delayed: -1,
          };
        } finally {
          // Always close the connection — we don't want dangling sockets
          await q?.close().catch(() => {});
        }
      }),
    );

    return { ok: true, queues: results };
  } catch (err: unknown) {
    return {
      ok: false,
      error: (err as Error)?.message?.slice(0, 200) ?? "unknown_error",
    };
  }
}

// ---------------------------------------------------------------------------
// Cron-based queue depth (no BullMQ — just DB counts)
//
// When ENABLE_BULLMQ=0 the project uses HTTP cron routes that drain the
// Broadcast and follow-up tables directly. We surface the raw DB counts
// as a lightweight "queue depth" so monitors still have visibility.
// ---------------------------------------------------------------------------
async function getCronStats(): Promise<{
  broadcastQueued: number;
  broadcastSending: number;
  followUpsPending: number;
}> {
  // Import prisma lazily so this file remains safe to compile without a
  // Prisma client (e.g. in a stripped test environment).
  const { prisma } = await import("@/lib/db");

  const [broadcastQueued, broadcastSending, followUpsPending] =
    await Promise.all([
      prisma.broadcast.count({ where: { status: "queued" } }).catch(() => -1),
      prisma.broadcast.count({ where: { status: "sending" } }).catch(() => -1),
      prisma.customer
        .count({
          where: {
            followUpAt: { lte: new Date() },
            followUpSent: false,
          },
        })
        .catch(() => -1),
    ]);

  return { broadcastQueued, broadcastSending, followUpsPending };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  if (!SECRET || req.headers.get("x-internal-secret") !== SECRET) {
    return unauthorized();
  }

  const bullmqEnabled = process.env.ENABLE_BULLMQ === "1";

  if (!bullmqEnabled) {
    // BullMQ is disabled — surface the cron-based DB queue depth instead
    const cronStats = await getCronStats().catch((err: unknown) => ({
      error: (err as Error)?.message?.slice(0, 100) ?? "cron_stats_failed",
    }));

    return Response.json(
      {
        bullmq: "disabled",
        cron: "active",
        cronQueueDepth: cronStats,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-cache, no-store" } },
    );
  }

  // BullMQ is enabled — connect and read queue stats
  const stats = await getBullMQStats();

  return Response.json(
    {
      bullmq: "enabled",
      cron: "disabled",
      ...(stats.ok ? { queues: stats.queues } : { queuesError: stats.error }),
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-cache, no-store" } },
  );
}
