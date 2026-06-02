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

  const [waSessions, queueDepth, failed24h, critical24h, aiUsage, msgCount, custCount, ordCount, dbSizeResult] =
    await Promise.all([
      // Active WhatsApp sessions
      prisma.bot.count({ where: { whatsappStatus: "connected" } }).catch(() => 0),
      // Queue depth
      prisma.waMessage.count({ where: { status: "queued" } }).catch(() => 0),
      // Failed messages (24h)
      prisma.waMessage.count({ where: { status: "failed", failedAt: { gte: dayAgo } } }).catch(() => 0),
      // Critical errors (24h)
      prisma.safetyAudit.count({ where: { level: "critical", createdAt: { gte: dayAgo } } }).catch(() => 0),
      // AI usage (7d)
      prisma.providerUsage
        .aggregate({ where: { day: { gte: weekAgo.toISOString().slice(0, 10) } }, _sum: { calls: true, inputTokens: true, outputTokens: true } })
        .catch(() => ({ _sum: { calls: null, inputTokens: null, outputTokens: null } })),
      // Total messages
      prisma.message.count().catch(() => 0),
      // Total customers
      prisma.customer.count().catch(() => 0),
      // Total orders
      prisma.order.count().catch(() => 0),
      // DB size (SQLite — reads file size from VPS)
      prisma.$queryRawUnsafe<{ size: number }[]>("SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()")
        .catch(() => []),
    ]);

  const aiCalls7d = aiUsage._sum.calls ?? 0;
  const aiInputTokens7d = aiUsage._sum.inputTokens ?? 0;
  const aiOutputTokens7d = aiUsage._sum.outputTokens ?? 0;

  // Process health
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || "unknown";
  const cpuCores = cpus.length;
  const totalMemMB = Math.round(os.totalmem() / 1048576);
  const freeMemMB = Math.round(os.freemem() / 1048576);
  const uptimeSec = Math.floor(process.uptime());

  return NextResponse.json({
    ts: now.toISOString(),
    server: {
      cpuModel,
      cpuCores,
      totalMemMB,
      freeMemMB,
      usedMemMB: totalMemMB - freeMemMB,
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
      uptimeSec,
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
    },
    whatsapp: {
      activeSessions: waSessions,
    },
    ai: {
      calls7d: aiCalls7d,
      inputTokens7d: aiInputTokens7d,
      outputTokens7d: aiOutputTokens7d,
    },
    errors: {
      critical24h,
    },
  });
}
