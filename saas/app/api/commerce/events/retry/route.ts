import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserForPermission } from "@/lib/auth";
import { syncCommerceOrderFromEvent } from "@/lib/commerce/orders";

export async function POST(req: Request) {
  const user = await getUserForPermission("settings");
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const eventId = body.eventId;
  if (!eventId) return NextResponse.json({ error: "eventId مطلوب" }, { status: 400 });

  const event = await prisma.commerceWebhookEvent.findUnique({
    where: { id: eventId },
    include: { integration: { select: { platform: true, userId: true } } },
  });
  if (!event) return NextResponse.json({ error: "الحدث غير موجود" }, { status: 404 });
  if (event.integration.userId !== user.id && (user as any).role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const payload = JSON.parse(event.normalizedPayload || event.rawPayload || "{}");
    await syncCommerceOrderFromEvent({
      eventId: event.id,
      integrationId: event.integrationId,
      userId: event.userId,
      platform: event.source,
      eventType: event.eventType,
      payload,
    });
    await prisma.commerceWebhookEvent.update({
      where: { id: eventId },
      data: { status: "processed", lastError: null, attempts: { increment: 1 } },
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await prisma.commerceWebhookEvent.update({
      where: { id: eventId },
      data: { status: "failed", lastError: err.message, attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
