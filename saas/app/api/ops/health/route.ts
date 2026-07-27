import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkInternalSecret } from "@/lib/internal-auth";

// Lightweight ops health endpoint — returns real production metrics without
// hitting any heavy pipelines. Protected by x-internal-secret so the response
// (which includes aggregate counts) is never public.

export async function GET(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const since1h = new Date(Date.now() - 60 * 60_000);
  const since24h = new Date(Date.now() - 24 * 60 * 60_000);

  const [
    botStatusCounts,
    messagesLast1h,
    messagesLast24h,
    failedQueueItems,
    bridgeCount,
    connectedBridges,
  ] = await Promise.all([
    // How many bots are connected vs disconnected
    prisma.bot.groupBy({
      by: ["whatsappStatus"],
      _count: { id: true },
    }),

    // Messages in last hour
    prisma.message.count({ where: { createdAt: { gte: since1h } } }),

    // Messages in last 24h
    prisma.message.count({ where: { createdAt: { gte: since24h } } }),

    // Broadcast items stuck in "sending" state for >10min (claimed but never finished)
    prisma.broadcastItem
      .count({
        where: {
          status: "sending",
          claimedAt: { lte: new Date(Date.now() - 10 * 60_000) },
        },
      })
      .catch(() => -1),

    // Total bridge registrations
    prisma.bridge.count().catch(() => -1),

    // Bridges online in last 5 minutes (heartbeat-based)
    prisma.bridge
      .count({
        where: { lastHeartbeatAt: { gte: new Date(Date.now() - 5 * 60_000) } } as any,
      })
      .catch(() => -1),
  ]);

  const statusMap: Record<string, number> = {};
  for (const r of botStatusCounts) {
    statusMap[r.whatsappStatus] = r._count.id;
  }

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    bots: {
      connected: statusMap["connected"] ?? 0,
      disconnected: statusMap["disconnected"] ?? 0,
      connecting: statusMap["connecting"] ?? 0,
    },
    messages: {
      last1h: messagesLast1h,
      last24h: messagesLast24h,
    },
    queue: {
      stuckItems: failedQueueItems,
    },
    bridges: {
      total: bridgeCount,
      onlineLast5min: connectedBridges,
    },
  });
}
