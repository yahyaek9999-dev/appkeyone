import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { recordCommerceWebhookEvent } from "@/lib/commerce/events";
import { syncCommerceOrderFromEvent } from "@/lib/commerce/orders";
import { dispatchCommerceAutomations } from "@/lib/commerce/notifications";
import { sha256 } from "@/lib/commerce/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "commerce-integration-test", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const integration = await (prisma as any).commerceIntegration.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, userId: true, platform: true },
  });
  if (!integration) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = Date.now();
  const payload = {
    event: "order.created",
    order: {
      id: `test-${now}`,
      name: `TEST-${String(now).slice(-6)}`,
      status: "pending",
      customer: { name: "Test Customer", phone: "+201000000000", email: "test@example.com" },
      items: [{ name: "Test Product", quantity: 1, price: 100, total: 100 }],
      subtotal: 100,
      shipping: 0,
      discount: 0,
      total: 100,
      currency: "EGP",
      paymentMethod: "cod",
    },
  };
  const rawPayload = JSON.stringify(payload);
  const eventType = "order.created";
  const externalEventId = `manual-test:${integration.id}:${now}`;

  const recorded = await recordCommerceWebhookEvent({
    integrationId: integration.id,
    userId: user.id,
    source: integration.platform || "custom",
    eventType,
    externalEventId,
    externalOrderId: payload.order.id,
    rawPayload,
    normalizedPayload: { eventType, externalOrderId: payload.order.id, payloadHash: sha256(rawPayload), test: true },
    signatureOk: true,
  });

  if (!recorded.eventId) return NextResponse.json({ ok: true, duplicate: true });

  const syncResult = await syncCommerceOrderFromEvent({
    eventId: recorded.eventId,
    integrationId: integration.id,
    userId: user.id,
    platform: integration.platform || "custom",
    eventType,
    payload,
  });

  if (!syncResult.skipped && syncResult.orderId) {
    dispatchCommerceAutomations({
      userId: user.id,
      integrationId: integration.id,
      eventId: recorded.eventId,
      eventType,
      orderId: syncResult.orderId,
    }).catch(() => {});
  }

  await (prisma as any).commerceIntegration.update({ where: { id: integration.id }, data: { lastTestAt: new Date(), lastEventAt: new Date() } }).catch(() => {});
  return NextResponse.json({ ok: true, eventId: recorded.eventId, sync: syncResult });
}
