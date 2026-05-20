import { prisma } from "@/lib/db";
import {
  normalizeCommerceOrder,
  type NormalizedCommerceOrder,
} from "./normalize";
import { markCommerceEventFailed, markCommerceEventProcessed } from "./events";
import { markFollowUpsConvertedForCustomer } from "@/lib/follow-ups";

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

function customerFallbackPhone(order: NormalizedCommerceOrder): string {
  return (
    order.customer.phone ||
    `external:${order.platform}:${order.externalOrderId}`.slice(0, 120)
  );
}

async function upsertCustomer(userId: string, order: NormalizedCommerceOrder) {
  const phone = customerFallbackPhone(order);
  return (prisma as any).customer.upsert({
    where: { userId_phone: { userId, phone } },
    create: {
      userId,
      phone,
      name: order.customer.name,
      notes: order.customer.email ? `Email: ${order.customer.email}` : null,
      lastSeenAt: new Date(),
    },
    update: {
      name: order.customer.name || undefined,
      lastSeenAt: new Date(),
    },
  });
}

async function replaceOrderItems(
  orderId: string,
  items: NormalizedCommerceOrder["items"],
) {
  await (prisma as any).orderItem.deleteMany({ where: { orderId } });
  if (!items.length) return;
  await (prisma as any).orderItem.createMany({
    data: items.map((item) => ({
      orderId,
      name: item.name,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      notes: item.sku ? `SKU: ${item.sku}` : null,
    })),
  });
}

export async function syncCommerceOrderFromEvent(args: {
  eventId: string;
  integrationId: string;
  userId: string;
  platform: string;
  eventType: string;
  payload: any;
}) {
  const normalized = normalizeCommerceOrder({
    eventType: args.eventType,
    platform: args.platform,
    payload: args.payload,
  });
  if (!normalized) {
    await markCommerceEventProcessed(args.eventId);
    return { skipped: true, reason: "not_order_event" };
  }

  try {
    const customer = await upsertCustomer(args.userId, normalized);
    const existing = await (prisma as any).order.findFirst({
      where: {
        userId: args.userId,
        externalSource: normalized.platform,
        externalOrderId: normalized.externalOrderId,
      },
      select: { id: true, status: true },
    });

    const data = {
      userId: args.userId,
      customerId: customer.id,
      customerName: normalized.customer.name,
      customerPhone: normalized.customer.phone || customer.phone,
      shippingAddress: normalized.customer.address,
      subtotal: normalized.subtotal,
      shipping: normalized.shipping,
      discount: normalized.discount,
      total: normalized.total,
      currency: normalized.currency,
      paymentMethod: normalized.paymentMethod,
      status: normalized.status,
      fulfillmentStatus: normalized.fulfillmentStatus,
      shippingStatus:
        normalized.status === "preparing"
          ? "preparing"
          : normalized.status === "shipped" ||
              normalized.status === "out_for_delivery" ||
              normalized.status === "delivered"
            ? "shipped"
            : "not_started",
      deliveryStatus:
        normalized.status === "out_for_delivery"
          ? "out_for_delivery"
          : normalized.status === "delivered"
            ? "delivered"
            : "not_started",
      trackingCode: normalized.trackingCode,
      aiConfidence: 100,
      aiNotes: "Imported from commerce webhook",
      source: "commerce",
      commerceIntegrationId: args.integrationId,
      externalSource: normalized.platform,
      externalOrderId: normalized.externalOrderId,
      externalOrderName: normalized.externalOrderName,
      externalPayload: safeJson(normalized.raw).slice(0, 20000),
    };

    const order = existing
      ? await (prisma as any).order.update({ where: { id: existing.id }, data })
      : await (prisma as any).order.create({ data });

    await replaceOrderItems(order.id, normalized.items);

    await (prisma as any).orderTimeline
      .create({
        data: {
          orderId: order.id,
          kind: existing ? "status_changed" : "created",
          message: existing
            ? `تم تحديث الطلب من ${normalized.platform}.`
            : `تم استلام الطلب من ${normalized.platform}.`,
          payload: safeJson({
            eventId: args.eventId,
            eventType: args.eventType,
            externalOrderId: normalized.externalOrderId,
            previousStatus: existing?.status || null,
            status: normalized.status,
            trackingCode: normalized.trackingCode,
          }),
        },
      })
      .catch(() => {});

    await (prisma as any).commerceWebhookEvent
      .update({
        where: { id: args.eventId },
        data: {
          normalizedPayload: safeJson(normalized),
          externalOrderId: normalized.externalOrderId,
        },
      })
      .catch(() => {});

    await markFollowUpsConvertedForCustomer(customer.id);
    await markCommerceEventProcessed(args.eventId);
    return {
      skipped: false,
      orderId: order.id,
      customerId: customer.id,
      created: !existing,
      trackingCode: normalized.trackingCode,
    };
  } catch (error) {
    await markCommerceEventFailed(args.eventId, error);
    throw error;
  }
}
