// Smart Campaigns — campaign analytics (honest, derived).
//
// We do NOT ingest WhatsApp delivery/read receipts and we have no link-click
// tracking, so `delivered` and `clicked` are returned as null ("not available")
// rather than fabricated. Everything else is derived from data we DO own:
//   sent / failed  → Broadcast counters
//   replied        → distinct recipients who sent an inbound message after send
//   conversion     → distinct recipients who placed an order after send
//
// All queries are bounded (recipient set capped) so a single request stays cheap.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 3000; // bound the IN() clause for big campaigns

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const bc = await prisma.broadcast.findFirst({
    where: { id: params.id, userId: uid },
  });
  if (!bc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Threshold: when the campaign began sending (fallback to creation time).
  const threshold = (bc as any).startedAt || bc.createdAt;

  // Recipients that were actually sent to.
  const sentItems = await prisma.broadcastItem.findMany({
    where: { broadcastId: bc.id, status: "sent" },
    select: { customerId: true },
    take: MAX_RECIPIENTS,
  });
  const recipientIds = Array.from(new Set(sentItems.map((i) => i.customerId)));

  let replied = 0;
  let conversion = 0;

  if (recipientIds.length > 0) {
    // Replied: distinct recipients with an inbound (role:"user") message after send.
    const repliedRows = await prisma.message.findMany({
      where: {
        role: "user",
        createdAt: { gt: threshold },
        conversation: { customerId: { in: recipientIds } },
      },
      select: { conversation: { select: { customerId: true } } },
      take: 8000,
    });
    replied = new Set(
      repliedRows.map((m) => m.conversation?.customerId).filter(Boolean),
    ).size;

    // Conversion: distinct recipients who placed an order after send.
    const orderRows = await prisma.order.findMany({
      where: {
        userId: uid,
        customerId: { in: recipientIds },
        createdAt: { gt: threshold },
      },
      select: { customerId: true },
      take: 8000,
    });
    conversion = new Set(orderRows.map((o) => o.customerId)).size;
  }

  const sent = bc.sent || 0;
  const replyRatePct = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;
  const convRatePct = sent > 0 ? Math.round((conversion / sent) * 1000) / 10 : 0;

  return NextResponse.json({
    id: bc.id,
    status: bc.status,
    total: bc.total || 0,
    sent,
    failed: bc.failed || 0,
    replied,
    conversion,
    replyRatePct,
    convRatePct,
    // Not trackable without WhatsApp receipts / link tracking — surfaced as null.
    delivered: null,
    clicked: null,
    note: "تسليم/نقرات غير متاحة (تتطلب إيصالات واتساب أو تتبّع روابط).",
  });
}
