// Broadcast analytics — reusable derivation (used by the A/B compare route).
//
// Mirrors the math in app/api/broadcasts/[id]/analytics/route.ts but as a
// callable function so the A/B comparison can score each variant without
// duplicating logic. The existing per-campaign analytics route is left as-is.

import { prisma } from "@/lib/db";

const MAX_RECIPIENTS = 3000;

export interface BroadcastStats {
  id: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  replied: number;
  conversion: number;
  replyRatePct: number;
  convRatePct: number;
}

export async function computeBroadcastAnalytics(userId: string, broadcastId: string): Promise<BroadcastStats | null> {
  const bc = await prisma.broadcast.findFirst({ where: { id: broadcastId, userId } });
  if (!bc) return null;

  const threshold = (bc as any).startedAt || bc.createdAt;
  const sentItems = await prisma.broadcastItem.findMany({
    where: { broadcastId: bc.id, status: "sent" },
    select: { customerId: true },
    take: MAX_RECIPIENTS,
  });
  const recipientIds = Array.from(new Set(sentItems.map((i) => i.customerId)));

  let replied = 0;
  let conversion = 0;
  if (recipientIds.length > 0) {
    const [repliedRows, orderRows] = await Promise.all([
      prisma.message.findMany({
        where: { role: "user", createdAt: { gt: threshold }, conversation: { customerId: { in: recipientIds } } },
        select: { conversation: { select: { customerId: true } } },
        take: 8000,
      }),
      prisma.order.findMany({
        where: { userId, customerId: { in: recipientIds }, createdAt: { gt: threshold } },
        select: { customerId: true },
        take: 8000,
      }),
    ]);
    replied = new Set(repliedRows.map((m) => m.conversation?.customerId).filter(Boolean)).size;
    conversion = new Set(orderRows.map((o) => o.customerId)).size;
  }

  const sent = bc.sent || 0;
  return {
    id: bc.id,
    status: bc.status,
    total: bc.total || 0,
    sent,
    failed: bc.failed || 0,
    replied,
    conversion,
    replyRatePct: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
    convRatePct: sent > 0 ? Math.round((conversion / sent) * 1000) / 10 : 0,
  };
}
