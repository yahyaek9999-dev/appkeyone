// Recovery outcome attribution — read-only, no writes.
//
// For each recovery broadcast sent in the last 30 days, check whether the
// target customer replied (inbound message) or ordered within a 7-day window.
// This turns "send and forget" into "send and learn".

import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7-day attribution window

export async function GET() {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // All recovery broadcast items sent in the last 30 days
  const items = await prisma.broadcastItem.findMany({
    where: {
      broadcast: { userId: uid, kind: "recovery" },
      status: "sent",
      sentAt: { gte: thirtyDaysAgo },
    },
    select: { customerId: true, sentAt: true },
  }).catch(() => [] as { customerId: string; sentAt: Date | null }[]);

  const validItems = items.filter((i) => i.sentAt != null) as {
    customerId: string;
    sentAt: Date;
  }[];

  if (validItems.length === 0) {
    return NextResponse.json({ sentLast30: 0, repliedWithin7d: 0, orderedWithin7d: 0, replyRate: 0, orderRate: 0 });
  }

  // Deduplicate by customer — use the most recent send per customer to avoid
  // double-counting customers who received multiple recovery messages.
  const latestSendByCustomer = new Map<string, Date>();
  for (const i of validItems) {
    const existing = latestSendByCustomer.get(i.customerId);
    if (!existing || i.sentAt > existing) {
      latestSendByCustomer.set(i.customerId, i.sentAt);
    }
  }

  const uniqueCustomers = Array.from(latestSendByCustomer.entries());

  // Check each customer for reply and order within the attribution window.
  // Batch in groups of 10 to keep DB connections bounded.
  let replied = 0;
  let ordered = 0;

  for (const [customerId, sentAt] of uniqueCustomers) {
    const windowEnd = new Date(sentAt.getTime() + WINDOW_MS);
    const [reply, order] = await Promise.all([
      prisma.message
        .findFirst({
          where: {
            conversation: { customerId },
            role: "user",
            createdAt: { gte: sentAt, lte: windowEnd },
          },
          select: { id: true },
        })
        .catch(() => null),
      (prisma as any).order
        .findFirst({
          where: {
            userId: uid,
            customerId,
            createdAt: { gte: sentAt, lte: windowEnd },
          },
          select: { id: true },
        })
        .catch(() => null),
    ]);

    if (reply) replied++;
    if (order) ordered++;
  }

  const total = uniqueCustomers.length;

  return NextResponse.json({
    sentLast30: total,
    repliedWithin7d: replied,
    orderedWithin7d: ordered,
    replyRate: total > 0 ? Math.round((replied / total) * 100) : 0,
    orderRate: total > 0 ? Math.round((ordered / total) * 100) : 0,
  });
}
