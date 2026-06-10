import { messaging } from "@/lib/messaging";
import { prisma } from "@/lib/db";
import { sendCommerceEmail } from "./email";
import { commerceTemplateVars, renderCommerceTemplate, renderCommerceTemplateHtml } from "./templates";
import { sha256 } from "./security";

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

function getOrderEmail(order: any): string {
  if (!order?.externalPayload) return "";
  try {
    const payload = JSON.parse(order.externalPayload);
    return String(payload?.customer?.email || payload?.billing?.email || payload?.email || "").trim();
  } catch {
    return "";
  }
}

async function createLog(args: {
  userId: string;
  integrationId?: string | null;
  orderId?: string | null;
  eventId?: string | null;
  eventType: string;
  channel: string;
  recipient: string;
  subject?: string;
  body: string;
  idempotencyKey: string;
}) {
  try {
    return await (prisma as any).commerceNotificationLog.create({
      data: {
        userId: args.userId,
        integrationId: args.integrationId || null,
        orderId: args.orderId || null,
        eventId: args.eventId || null,
        eventType: args.eventType,
        channel: args.channel,
        recipient: args.recipient,
        subject: args.subject || "",
        body: args.body,
        status: "queued",
        idempotencyKey: args.idempotencyKey,
      },
    });
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") return null;
    throw e;
  }
}

async function throttleBlocked(args: { userId: string; channel: string; recipient: string; eventType: string; throttleSeconds: number }) {
  if (!args.throttleSeconds || args.throttleSeconds <= 0) return false;
  const since = new Date(Date.now() - args.throttleSeconds * 1000);
  const recent = await (prisma as any).commerceNotificationLog.findFirst({
    where: {
      userId: args.userId,
      channel: args.channel,
      recipient: args.recipient,
      eventType: args.eventType,
      createdAt: { gte: since },
    },
    select: { id: true },
  }).catch(() => null);
  return !!recent;
}

export async function dispatchCommerceAutomations(args: {
  userId: string;
  integrationId: string;
  eventId: string;
  eventType: string;
  orderId?: string | null;
  trackingCode?: string | null;
}) {
  const [automations, bot, order] = await Promise.all([
    (prisma as any).commerceAutomation.findMany({
      where: {
        userId: args.userId,
        enabled: true,
        eventType: args.eventType,
        OR: [{ integrationId: args.integrationId }, { integrationId: null }],
      },
    }),
    prisma.bot.findUnique({ where: { userId: args.userId }, select: { name: true } }).catch(() => null),
    args.orderId
      ? (prisma as any).order.findFirst({
          where: { id: args.orderId, userId: args.userId },
          include: { customer: { select: { id: true, name: true, phone: true } } },
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!automations.length) return { sent: 0, skipped: 0 };

  const vars = commerceTemplateVars({ shopName: bot?.name, order, customer: order?.customer, eventType: args.eventType, trackingCode: args.trackingCode });
  let sent = 0;
  let skipped = 0;

  for (const automation of automations) {
    const channel = String(automation.channel || "");
    const recipient = channel === "email" ? getOrderEmail(order) : String(order?.customerPhone || order?.customer?.phone || "");

    if (channel === "dashboard" || channel === "analytics" || channel === "ai_followup") {
      const key = sha256([args.eventId, channel, automation.id].join(":"));
      const log = await createLog({
        userId: args.userId,
        integrationId: args.integrationId,
        orderId: args.orderId,
        eventId: args.eventId,
        eventType: args.eventType,
        channel,
        recipient: "internal",
        body: renderCommerceTemplate(automation.template || args.eventType, vars),
        idempotencyKey: key,
      });
      if (log) sent++; else skipped++;
      continue;
    }

    if (!recipient) {
      skipped++;
      continue;
    }

    if (await throttleBlocked({ userId: args.userId, channel, recipient, eventType: args.eventType, throttleSeconds: automation.throttleSeconds || 300 })) {
      skipped++;
      continue;
    }

    const body = renderCommerceTemplate(automation.template, vars).slice(0, 4000);
    const subject = renderCommerceTemplate(automation.subject || "تحديث طلبك", vars).slice(0, 200);
    const idempotencyKey = sha256([args.eventId, automation.id, channel, recipient].join(":"));
    const log = await createLog({
      userId: args.userId,
      integrationId: args.integrationId,
      orderId: args.orderId,
      eventId: args.eventId,
      eventType: args.eventType,
      channel,
      recipient,
      subject,
      body,
      idempotencyKey,
    });
    if (!log) {
      skipped++;
      continue;
    }

    if (channel === "whatsapp") {
      const result = await messaging.send({ userId: args.userId, to: recipient, text: body, idempotencyKey });
      await (prisma as any).commerceNotificationLog.update({
        where: { id: log.id },
        data: {
          status: result.ok ? "sent" : "failed",
          provider: result.provider,
          attempts: { increment: 1 },
          sentAt: result.ok ? new Date() : null,
          error: result.ok ? null : safeJson(result.data).slice(0, 500),
        },
      }).catch(() => {});
      if (result.ok) sent++; else skipped++;
      continue;
    }

    if (channel === "email") {
      // HTML-escape interpolated values for the email body (order/customer data
      // comes from external webhooks and must not inject markup). WhatsApp above
      // uses the plain-text `body` unchanged.
      const htmlBody = renderCommerceTemplateHtml(automation.template, vars).slice(0, 4000);
      const result = await sendCommerceEmail({ userId: args.userId, to: recipient, subject, html: htmlBody, text: body });
      await (prisma as any).commerceNotificationLog.update({
        where: { id: log.id },
        data: {
          status: result.ok ? "sent" : "failed",
          provider: result.provider,
          attempts: { increment: 1 },
          sentAt: result.ok ? new Date() : null,
          error: result.ok ? null : (result.error || "email_failed").slice(0, 500),
        },
      }).catch(() => {});
      if (result.ok) sent++; else skipped++;
      continue;
    }

    skipped++;
  }

  return { sent, skipped };
}
