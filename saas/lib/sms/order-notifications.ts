// K1SMS — order lifecycle SMS notifications
// Hooks into order status changes to fire SMS confirmations + status updates.
// Does NOT modify the WhatsApp pipeline.

import { prisma } from "@/lib/db";
import { sendSmsFromTemplate, sendSms, renderTemplate } from "./send";

/** Default SMS body for order confirmation (used when no custom template exists). */
function defaultConfirmBody(vars: Record<string, string>): string {
  return `مرحباً ${vars.customerName ?? "عزيزي"}،\nتم تأكيد طلبك رقم #${vars.orderNumber ?? ""}.\nالإجمالي: ${vars.total ?? ""}\nشكراً لاختيارك ${vars.shop ?? "متجرنا"} 🎉`;
}

/** Default SMS body for order status change. */
function defaultStatusBody(status: string, vars: Record<string, string>): string {
  const msgs: Record<string, string> = {
    confirmed:   `تم تأكيد طلبك #${vars.orderNumber} وجاري التجهيز. — ${vars.shop}`,
    preparing:   `طلبك #${vars.orderNumber} قيد التجهيز الآن. — ${vars.shop}`,
    shipped:     `طلبك #${vars.orderNumber} في الطريق إليك! رقم التتبع: ${vars.trackingCode ?? "—"}`,
    out_for_delivery: `طلبك #${vars.orderNumber} خرج للتسليم اليوم. — ${vars.shop}`,
    delivered:   `تم تسليم طلبك #${vars.orderNumber} بنجاح. شكراً لك! — ${vars.shop}`,
    cancelled:   `تم إلغاء طلبك #${vars.orderNumber}. للاستفسار تواصل معنا. — ${vars.shop}`,
    refunded:    `تمت معالجة استرداد طلبك #${vars.orderNumber}. — ${vars.shop}`,
  };
  return msgs[status] ?? `تحديث على طلبك #${vars.orderNumber} — ${vars.shop}`;
}

/** Send SMS confirmation when a new order is created.
 *  Called from order creation hooks — non-blocking (errors are swallowed). */
export async function sendOrderConfirmationSms(
  userId: string,
  orderId: string,
): Promise<void> {
  try {
    const order = await (prisma as any).order.findFirst({
      where: { id: orderId, userId },
      include: { customer: { select: { name: true, phone: true } } },
    });
    if (!order) return;

    const bot = await (prisma as any).bot.findUnique({ where: { userId }, select: { name: true } });
    const phone = order.shippingPhone ?? order.customer?.phone;
    if (!phone) return;

    const vars: Record<string, string> = {
      customerName: order.customerName ?? order.customer?.name ?? "",
      orderNumber: String(order.orderNumber ?? order.id.slice(-6).toUpperCase()),
      total: `${order.total} ر.س`,
      shop: bot?.name ?? "متجرنا",
    };

    // Try custom template first
    const tpl = await (prisma as any).smsTemplate.findFirst({
      where: { userId, purpose: "order_confirmation", enabled: true },
      orderBy: { createdAt: "desc" },
    });

    if (tpl) {
      await sendSmsFromTemplate(userId, tpl.id, phone, vars, { orderId });
    } else {
      await sendSms({ userId, to: phone, body: defaultConfirmBody(vars), purpose: "order_confirmation", orderId });
    }
  } catch {
    // Non-critical — log swallowed
  }
}

/** Send SMS when an order status changes.
 *  status: the new status string from the Order model. */
export async function sendOrderStatusSms(
  userId: string,
  orderId: string,
  status: string,
): Promise<void> {
  try {
    const order = await (prisma as any).order.findFirst({
      where: { id: orderId, userId },
      include: { customer: { select: { name: true, phone: true } } },
    });
    if (!order) return;

    const bot = await (prisma as any).bot.findUnique({ where: { userId }, select: { name: true } });
    const phone = order.shippingPhone ?? order.customer?.phone;
    if (!phone) return;

    const vars: Record<string, string> = {
      customerName: order.customerName ?? order.customer?.name ?? "",
      orderNumber: String(order.orderNumber ?? order.id.slice(-6).toUpperCase()),
      total: `${order.total} ر.س`,
      shop: bot?.name ?? "متجرنا",
      trackingCode: order.trackingCode ?? "",
      trackingUrl: order.trackingUrl ?? "",
    };

    // Try status-specific custom template
    const tpl = await (prisma as any).smsTemplate.findFirst({
      where: { userId, purpose: "order_status", statusTrigger: status, enabled: true },
      orderBy: { createdAt: "desc" },
    });

    if (tpl) {
      await sendSmsFromTemplate(userId, tpl.id, phone, vars, { orderId });
    } else {
      const body = defaultStatusBody(status, vars);
      await sendSms({ userId, to: phone, body, purpose: "order_status", orderId });
    }
  } catch {
    // Non-critical
  }
}
