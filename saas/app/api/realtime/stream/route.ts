import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCachedSnapshot } from "@/lib/snapshot-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TICK_MS = 5000;
const MAX_TICKS = 120; // 10 minutes; EventSource reconnects automatically.

async function buildSnapshot(userId: string, customerId?: string | null) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    conversations,
    messages,
    broadcastsActive,
    ordersOpen,
    latestMessage,
    latestBroadcast,
    latestOrder,
    commerceIntegrations,
    commerceFailedEvents,
    latestCommerceEvent,
    latestCommerceNotification,
    safetyEvent,
    escalationActive,
    escalationCritical,
    latestEscalation,
    bot,
  ] = await Promise.all([
    prisma.conversation
      .count({ where: { customer: { userId } } })
      .catch(() => 0),
    prisma.message
      .count({ where: { conversation: { customer: { userId } } } })
      .catch(() => 0),
    prisma.broadcast
      .count({ where: { userId, status: { in: ["queued", "sending"] } } })
      .catch(() => 0),
    prisma.order
      .count({
        where: { userId, status: { in: ["pending", "confirmed"] } } as any,
      })
      .catch(() => 0),
    prisma.message
      .findFirst({
        where: { conversation: { customer: { userId } } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
      .catch(() => null),
    prisma.broadcast
      .findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      })
      .catch(() => null),
    prisma.order
      .findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      })
      .catch(() => null),
    (prisma as any).commerceIntegration?.count
      ? (prisma as any).commerceIntegration
          .count({ where: { userId, enabled: true } })
          .catch(() => 0)
      : Promise.resolve(0),
    (prisma as any).commerceWebhookEvent?.count
      ? (prisma as any).commerceWebhookEvent
          .count({ where: { userId, status: "failed" } })
          .catch(() => 0)
      : Promise.resolve(0),
    (prisma as any).commerceWebhookEvent?.findFirst
      ? (prisma as any).commerceWebhookEvent
          .findFirst({
            where: { userId },
            orderBy: { receivedAt: "desc" },
            select: { receivedAt: true, status: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    (prisma as any).commerceNotificationLog?.findFirst
      ? (prisma as any).commerceNotificationLog
          .findFirst({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true, status: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    (prisma as any).safetyAudit?.findFirst
      ? (prisma as any).safetyAudit
          .findFirst({
            where: { userId, createdAt: { gte: since24h } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    (prisma as any).escalationTicket?.count
      ? (prisma as any).escalationTicket
          .count({
            where: {
              userId,
              status: { in: ["open", "acknowledged", "human_active"] },
            },
          })
          .catch(() => 0)
      : Promise.resolve(0),
    (prisma as any).escalationTicket?.count
      ? (prisma as any).escalationTicket
          .count({
            where: {
              userId,
              severity: { in: ["high", "critical"] },
              status: { in: ["open", "acknowledged", "human_active"] },
            },
          })
          .catch(() => 0)
      : Promise.resolve(0),
    (prisma as any).escalationTicket?.findFirst
      ? (prisma as any).escalationTicket
          .findFirst({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true, status: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    prisma.bot
      .findUnique({
        where: { userId },
        select: {
          whatsappStatus: true,
          whatsappPhone: true,
          connectionMode: true,
          metaPhoneNumberId: true,
        } as any,
      })
      .catch(() => null) as any,
  ]);

  const [alerts24h, activeConversation] = await Promise.all([
    (prisma as any).safetyAudit?.count
      ? (prisma as any).safetyAudit
          .count({ where: { userId, createdAt: { gte: since24h } } })
          .catch(() => 0)
      : Promise.resolve(0),
    customerId
      ? prisma.conversation
          .findUnique({
            where: { customerId },
            select: {
              customerId: true,
              botPaused: true,
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
              },
              _count: { select: { messages: true } },
            },
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const active = activeConversation
    ? {
        customerId: activeConversation.customerId,
        messageCount: activeConversation._count.messages,
        lastMessageAt:
          activeConversation.messages[0]?.createdAt?.toISOString() || null,
        botPaused: activeConversation.botPaused,
      }
    : null;

  const latest = {
    messageAt: latestMessage?.createdAt?.toISOString() || null,
    broadcastAt: latestBroadcast?.updatedAt?.toISOString() || null,
    orderAt: latestOrder?.updatedAt?.toISOString() || null,
    commerceEventAt: latestCommerceEvent?.receivedAt?.toISOString() || null,
    commerceNotificationAt:
      latestCommerceNotification?.updatedAt?.toISOString() || null,
    safetyAt: safetyEvent?.createdAt?.toISOString() || null,
    escalationAt: latestEscalation?.updatedAt?.toISOString() || null,
  };

  const seq = [
    conversations,
    messages,
    broadcastsActive,
    ordersOpen,
    alerts24h,
    latest.messageAt || "",
    latest.broadcastAt || "",
    latest.orderAt || "",
    latest.commerceEventAt || "",
    latest.commerceNotificationAt || "",
    commerceIntegrations,
    commerceFailedEvents,
    latest.safetyAt || "",
    latest.escalationAt || "",
    escalationActive,
    escalationCritical,
    active?.messageCount || 0,
    active?.lastMessageAt || "",
    bot?.whatsappStatus || "",
  ].join("|");

  return {
    ts: new Date().toISOString(),
    seq,
    userId,
    totals: {
      conversations,
      messages,
      broadcastsActive,
      ordersOpen,
      alerts24h,
      commerceIntegrations,
      commerceFailedEvents,
      escalationActive,
      escalationCritical,
    },
    latest,
    activeConversation: active,
    whatsapp: bot
      ? {
          status: bot.whatsappStatus || "disconnected",
          phone: bot.whatsappPhone || null,
          mode: bot.connectionMode || "qr",
          metaConfigured: !!bot.metaPhoneNumberId,
        }
      : null,
  };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = user.id;

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");
  const wantsJson = (req.headers.get("accept") || "").includes(
    "application/json",
  );

  if (wantsJson) {
    const snapshot = await getCachedSnapshot(userId, customerId, () =>
      buildSnapshot(userId, customerId),
    );
    return NextResponse.json(snapshot);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let tick = 0;
      let closed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      function closeStream() {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        try {
          controller.close();
        } catch {}
      }

      async function send() {
        if (closed) return;
        try {
          const snapshot = await getCachedSnapshot(userId, customerId, () =>
            buildSnapshot(userId, customerId),
          );
          controller.enqueue(
            encoder.encode(
              `event: message\ndata: ${JSON.stringify(snapshot)}\n\n`,
            ),
          );
        } catch (e: any) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: "snapshot_failed" })}\n\n`,
            ),
          );
        }
        tick++;
        if (tick >= MAX_TICKS) {
          closeStream();
        }
      }

      await send();
      if (!closed) interval = setInterval(send, TICK_MS);
      req.signal.addEventListener("abort", closeStream);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
