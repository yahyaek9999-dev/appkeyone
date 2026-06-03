import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserForPermission, getAuthContext } from "@/lib/auth";
import { wa } from "@/lib/wa";
import { dispatchCommerceAutomations } from "@/lib/commerce/notifications";
import { usageIdempotencyKey } from "@/lib/usage-ledger";
import { maybeSendShippingUpdate } from "@/lib/shipping/notify";
import { auditCtx } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set([
  "pending",
  "confirmed",
  "preparing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "canceled",
  "returned",
]);
const ALLOWED_FULFILLMENT = new Set(["unfulfilled", "partial", "fulfilled"]);

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const user = await getUserForPermission("customers");
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const order = await (prisma as any).order.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    include: {
      items: true,
      timeline: { orderBy: { createdAt: "asc" } },
      customer: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, order });
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const user = await getUserForPermission("customers");
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  // Validate
  const data: any = {};
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.has(body.status))
      return NextResponse.json({ error: "bad_status" }, { status: 400 });
    data.status = body.status;
  }
  if (body.fulfillmentStatus !== undefined) {
    if (!ALLOWED_FULFILLMENT.has(body.fulfillmentStatus))
      return NextResponse.json({ error: "bad_fulfillment" }, { status: 400 });
    data.fulfillmentStatus = body.fulfillmentStatus;
  }
  if (typeof body.shipping === "number" && body.shipping >= 0)
    data.shipping = Math.round(body.shipping);
  if (typeof body.discount === "number" && body.discount >= 0)
    data.discount = Math.round(body.discount);
  if (typeof body.subtotal === "number" && body.subtotal >= 0)
    data.subtotal = Math.round(body.subtotal);
  if (typeof body.total === "number" && body.total >= 0)
    data.total = Math.round(body.total);
  if (typeof body.paymentMethod === "string")
    data.paymentMethod = body.paymentMethod.slice(0, 30);
  if (typeof body.shippingAddress === "string")
    data.shippingAddress = body.shippingAddress.slice(0, 500);
  if (typeof body.customerName === "string")
    data.customerName = body.customerName.slice(0, 100);
  if (typeof body.flaggedReason === "string")
    data.flaggedReason = body.flaggedReason.slice(0, 200);
  if (typeof body.trackingCode === "string")
    data.trackingCode = body.trackingCode.slice(0, 100);
  if (typeof body.trackingUrl === "string")
    data.trackingUrl = body.trackingUrl.slice(0, 500);
  if (typeof body.courierName === "string")
    data.courierName = body.courierName.slice(0, 100);
  if (body.status === "preparing") data.shippingStatus = "preparing";
  if (body.status === "packed") data.shippingStatus = "preparing";
  if (body.status === "shipped") data.shippingStatus = "shipped";
  if (body.status === "out_for_delivery") {
    data.shippingStatus = "shipped";
    data.deliveryStatus = "out_for_delivery";
  }
  if (body.status === "delivered") {
    data.shippingStatus = "shipped";
    data.deliveryStatus = "delivered";
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  // Ownership guard
  const existing = await (prisma as any).order.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    select: { id: true, status: true },
  });
  if (!existing)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await (prisma as any).order.update({
    where: { id: ctx.params.id },
    data,
  });

  void auditCtx(await getAuthContext(), "order.updated", {
    userId: user.id,
    targetType: "order",
    targetId: ctx.params.id,
    metadata: { fields: Object.keys(data) },
    req,
  });

  // Timeline event when status changes
  if (data.status && data.status !== existing.status) {
    await (prisma as any).orderTimeline
      .create({
        data: {
          orderId: ctx.params.id,
          kind: "status_changed",
          message: `الحالة تغيّرت إلى: ${data.status}`,
          payload: JSON.stringify({ from: existing.status, to: data.status }),
        },
      })
      .catch(() => {});

    // Event-driven commerce notifications. Existing shipment-only opt-in is
    // preserved, and the richer automation engine can send WhatsApp/email when
    // the merchant enables templates.
    dispatchOrderStatusAutomation({
      userId: user.id,
      orderId: ctx.params.id,
      status: data.status,
      trackingCode: body.trackingCode || data.trackingCode || null,
    }).catch((e) => {
      console.error("[orders] status automation failed:", e?.message || e);
      Sentry.captureException(e, { tags: { context: "order_status_automation" } });
    });

    if (data.status === "shipped") {
      sendShipmentNotification(
        ctx.params.id,
        user.id,
        body.trackingCode || null,
      ).catch((e) =>
        console.error("[orders] shipment notify failed:", e?.message || e),
      );
    }

    // Growth Suite: built-in per-status shipping update (easy mode). No-op
    // unless the merchant enabled Bot.orderStatusNotifyEnabled; queued + safe.
    maybeSendShippingUpdate({
      userId: user.id,
      orderId: ctx.params.id,
      status: data.status,
    }).catch((e) => {
      console.error("[orders] shipping update failed:", e?.message || e);
      Sentry.captureException(e, { tags: { context: "order_shipping_update" } });
    });
  }

  return NextResponse.json({ ok: true, order: updated });
}

async function dispatchOrderStatusAutomation(args: {
  userId: string;
  orderId: string;
  status: string;
  trackingCode?: string | null;
}) {
  const map: Record<string, string> = {
    confirmed: "order.confirmed",
    preparing: "order.preparing",
    shipped: "order.shipped",
    out_for_delivery: "order.out_for_delivery",
    delivered: "order.delivered",
    canceled: "order.cancelled",
  };
  const eventType = map[args.status] || "order.updated";
  const eventId = usageIdempotencyKey([
    "manual-order-status",
    args.orderId,
    args.status,
    Date.now(),
  ]);
  await dispatchCommerceAutomations({
    userId: args.userId,
    integrationId: "manual",
    eventId,
    eventType,
    orderId: args.orderId,
    trackingCode: args.trackingCode || null,
  });
  await (prisma as any).order
    .update({
      where: { id: args.orderId },
      data: {
        lastNotifiedStatus: args.status,
        lastCustomerNotifiedAt: new Date(),
      } as any,
    })
    .catch(() => {});
}

/**
 * Send the shipment-notify WhatsApp message to the customer.
 * No-op when:
 *  - merchant disabled `shipmentNotifyEnabled`
 *  - no template configured
 *  - no customer phone on the order
 */
async function sendShipmentNotification(
  orderId: string,
  userId: string,
  trackingCode: string | null,
) {
  const bot = (await prisma.bot.findUnique({
    where: { userId },
    select: {
      name: true,
      // @ts-ignore — fields added in schema, Prisma client regen on db push
      shipmentNotifyEnabled: true,
      // @ts-ignore
      shipmentNotifyTemplate: true,
    } as any,
  })) as any;
  if (!bot || !bot.shipmentNotifyEnabled) return;
  const tpl = (bot.shipmentNotifyTemplate || "").trim();
  if (!tpl) return;

  const order = await (prisma as any).order.findUnique({
    where: { id: orderId },
    select: {
      customerPhone: true,
      customer: { select: { phone: true, name: true } },
    },
  });
  const to = order?.customerPhone || order?.customer?.phone;
  if (!to) return;

  const message = tpl
    .replace(/\{tracking\}/g, trackingCode || "—")
    .replace(/\{shop\}/g, bot.name || "متجرك")
    .replace(/\{name\}/g, order?.customer?.name || "صديقنا");

  const r = await wa.send(userId, to, message, "order_update");
  if (!r.ok) {
    await prisma.safetyAudit
      .create({
        data: {
          userId,
          level: "warn",
          category: "shipment",
          title: "فشل إرسال تنبيه الشحن للعميل",
          detail:
            typeof r.data === "string"
              ? r.data
              : JSON.stringify(r.data || {}).slice(0, 400),
          payload: JSON.stringify({ orderId, to }),
        },
      })
      .catch(() => {});
  } else {
    await (prisma as any).orderTimeline
      .create({
        data: {
          orderId,
          kind: "reminder_sent",
          message: "تم إرسال تنبيه الشحن للعميل تلقائياً.",
        },
      })
      .catch(() => {});
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const user = await getUserForPermission("customers");
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const existing = await (prisma as any).order.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    select: { id: true },
  });
  if (!existing)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  await (prisma as any).order.delete({ where: { id: ctx.params.id } });

  void auditCtx(await getAuthContext(), "order.deleted", {
    userId: user.id,
    targetType: "order",
    targetId: ctx.params.id,
    req: _req,
  });

  return NextResponse.json({ ok: true });
}
