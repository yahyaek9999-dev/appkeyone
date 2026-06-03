// System monitoring — aggregated health endpoint (read-only, bounded).
// Gathers everything the ops dashboard needs into one response.
// No new models — pure aggregation of existing tables.
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as os from "os";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [
    waSessions, queueDepth, failed24h, deadLetter, critical24h, warn24h,
    aiUsage, cacheHits7d, msgCount, custCount, ordCount, dbSizeResult,
    broadcastsSending, broadcastsQueued,
  ] = await Promise.all([
    prisma.bot.count({ where: { whatsappStatus: "connected" } }).catch(() => 0),
    prisma.waMessage.count({ where: { status: "queued" } }).catch(() => 0),
    prisma.waMessage.count({ where: { status: "failed", failedAt: { gte: dayAgo } } }).catch(() => 0),
    // Dead-letter = messages that failed and exhausted all retries (attempts >= 5)
    prisma.waMessage.count({ where: { status: "failed", attempts: { gte: 5 } } }).catch(() => 0),
    prisma.safetyAudit.count({ where: { level: "critical", createdAt: { gte: dayAgo } } }).catch(() => 0),
    prisma.safetyAudit.count({ where: { level: "warn", createdAt: { gte: dayAgo } } }).catch(() => 0),
    prisma.providerUsage
      .aggregate({ where: { day: { gte: weekAgo.toISOString().slice(0, 10) } }, _sum: { calls: true, inputTokens: true, outputTokens: true } })
      .catch(() => ({ _sum: { calls: null, inputTokens: null, outputTokens: null } })),
    // LLM cache hits (7d) — from MetricEvent (day is a "YYYY-MM-DD" string)
    prisma.metricEvent.aggregate({ where: { kind: "cache_hit", day: { gte: weekAgo.toISOString().slice(0, 10) } }, _sum: { count: true } }).catch(() => ({ _sum: { count: null } })),
    prisma.message.count().catch(() => 0),
    prisma.customer.count().catch(() => 0),
    prisma.order.count().catch(() => 0),
    prisma.$queryRawUnsafe<{ size: number }[]>("SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()").catch(() => []),
    prisma.broadcast.count({ where: { status: "sending" } }).catch(() => 0),
    prisma.broadcast.count({ where: { status: "queued" } }).catch(() => 0),
  ]);

  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const totalMemMB = Math.round(os.totalmem() / 1048576);
  const freeMemMB = Math.round(os.freemem() / 1048576);

  return NextResponse.json({
    ts: now.toISOString(),
    server: {
      cpuModel: cpus[0]?.model || "unknown",
      cpuCores: cpus.length,
      totalMemMB,
      freeMemMB,
      usedMemMB: totalMemMB - freeMemMB,
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
      uptimeSec: Math.floor(process.uptime()),
    },
    database: {
      sizeBytes: dbSizeResult.length > 0 ? (dbSizeResult as any[])[0].size : null,
      messages: msgCount,
      customers: custCount,
      orders: ordCount,
    },
    queue: {
      queued: queueDepth,
      failed24h,
      deadLetter,
    },
    whatsapp: { activeSessions: waSessions },
    ai: {
      calls7d: aiUsage._sum.calls ?? 0,
      inputTokens7d: aiUsage._sum.inputTokens ?? 0,
      outputTokens7d: aiUsage._sum.outputTokens ?? 0,
      cacheHits7d: (cacheHits7d as any)._sum?.count ?? 0,
    },
    errors: { critical24h, warn24h },
    broadcasts: { sending: broadcastsSending, queued: broadcastsQueued },
  });
}
