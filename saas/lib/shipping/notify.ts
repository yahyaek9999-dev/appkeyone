// Growth Suite — shipping lifecycle WhatsApp updates to the customer.
//
// Additive "easy mode": fires built-in Arabic templates on each order status
// change WHEN the merchant has enabled `Bot.orderStatusNotifyEnabled` (default
// OFF → existing accounts are unaffected). Sends through the protected queue
// (wa.send → outgoing-queue). Never bypasses safety. The legacy shipped-only
// `shipmentNotifyEnabled` path still owns "shipped" if it's enabled (no dup).

import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";

export const SHIPPING_STATUS_DEFAULTS: Record<string, string> = {
  preparing: "🛠️ طلبك جاري تجهيزه يا {name}! هنطمنك أول ما يتشحن.",
  packed: "📦 تم تجهيز وتغليف طلبك بنجاح، وهيتشحن قريب جدًا.",
  shipped: "🚚 تم شحن طلبك! {tracking_line}",
  out_for_delivery: "🛵 مندوب الشحن في الطريق إليك الآن. جهّز المبلغ لو الدفع عند الاستلام.",
  delivered: "✅ تم تسليم طلبك بنجاح. شكراً لتعاملك معانا! لو محتاج أي حاجة تانية إحنا في الخدمة 🌟",
  canceled: "تم إلغاء طلبك. لو في أي استفسار أو حابب تطلب تاني، إحنا موجودين 🙏",
  returned: "تم تسجيل مرتجع لطلبك، وهنتواصل معاك لإتمام الإجراءات. شكراً لتفهمك 🙏",
};

const NOTIFY_STATUSES = new Set(Object.keys(SHIPPING_STATUS_DEFAULTS));

function parseTemplates(json: string | null | undefined): Record<string, string> {
  try {
    const v = JSON.parse(json || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export async function maybeSendShippingUpdate(args: {
  userId: string;
  orderId: string;
  status: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!NOTIFY_STATUSES.has(args.status)) return { sent: false, reason: "status_not_notifiable" };

  const bot: any = await prisma.bot
    .findUnique({
      where: { userId: args.userId },
      select: {
        name: true,
        orderStatusNotifyEnabled: true,
        shipmentNotifyEnabled: true,
        shippingTemplates: true,
      } as any,
    })
    .catch(() => null);

  if (!bot || !bot.orderStatusNotifyEnabled) return { sent: false, reason: "disabled" };
  // Avoid double-send: the legacy shipment-only opt-in owns "shipped".
  if (args.status === "shipped" && bot.shipmentNotifyEnabled) return { sent: false, reason: "legacy_owns_shipped" };

  const templates = parseTemplates(bot.shippingTemplates);
  const tpl = String(templates[args.status] || SHIPPING_STATUS_DEFAULTS[args.status] || "").trim();
  if (!tpl) return { sent: false, reason: "no_template" };

  const order: any = await prisma.order
    .findUnique({
      where: { id: args.orderId },
      select: {
        customerPhone: true,
        trackingCode: true,
        trackingUrl: true,
        courierName: true,
        customer: { select: { phone: true, name: true } },
      } as any,
    })
    .catch(() => null);

  const to = order?.customerPhone || order?.customer?.phone;
  if (!to) return { sent: false, reason: "no_phone" };

  const trackingLine = order?.trackingCode
    ? `رقم التتبع: ${order.trackingCode}${order.trackingUrl ? `\n${order.trackingUrl}` : ""}`
    : order?.trackingUrl || "";
  const msg = tpl
    .replace(/\{name\}/g, order?.customer?.name || "صديقنا")
    .replace(/\{shop\}/g, bot.name || "متجرك")
    .replace(/\{tracking\}/g, order?.trackingCode || "—")
    .replace(/\{tracking_line\}/g, trackingLine)
    .replace(/\{courier\}/g, order?.courierName || "")
    .replace(/\{url\}/g, order?.trackingUrl || "")
    .trim();

  const r = await wa.send(args.userId, to, msg, "order_update");
  if (!r.ok) {
    await prisma.safetyAudit
      .create({
        data: {
          userId: args.userId,
          level: "warn",
          category: "shipping",
          title: "فشل إرسال تحديث الشحن للعميل",
          detail: typeof r.data === "string" ? r.data : JSON.stringify(r.data || {}).slice(0, 400),
          payload: JSON.stringify({ orderId: args.orderId, status: args.status }),
        },
      })
      .catch(() => {});
    return { sent: false, reason: "send_failed" };
  }
  await (prisma as any).orderTimeline
    .create({
      data: {
        orderId: args.orderId,
        kind: "reminder_sent",
        message: `تم إرسال تحديث الحالة (${args.status}) للعميل تلقائياً.`,
      },
    })
    .catch(() => {});
  return { sent: true };
}
