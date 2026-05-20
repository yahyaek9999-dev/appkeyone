import { prisma } from "@/lib/db";
import { notifyAdmin, resolveNotifyPhone } from "@/lib/notify";
import { sendCommerceEmail } from "@/lib/commerce/email";
import { bump } from "@/lib/metrics";
import type { EmotionalAnalysis } from "@/lib/sentiment";

function safeJson(value: unknown): string {
  try { return JSON.stringify(value || {}); } catch { return "{}"; }
}

function severityToHandoff(severity: string): string {
  return severity === "critical" || severity === "high" ? "human_required" : "escalation_pending";
}

function escalationTitle(a: EmotionalAnalysis): string {
  if (a.intent === "refund") return "طلب استرجاع/فلوس يحتاج تدخل";
  if (a.intent === "escalation") return "العميل طلب الإدارة";
  if (a.severity === "critical") return "تصعيد حرج";
  if (a.sentiment === "angry") return "عميل غاضب";
  return "تصعيد دعم";
}

export async function createEscalationTicket(args: {
  userId: string;
  customerId: string;
  conversationId: string;
  customerPhone?: string | null;
  customerName?: string | null;
  messageText: string;
  analysis: EmotionalAnalysis;
  bot?: any;
  notifyPhone?: string | null;
  sourceMessageId?: string | null;
}) {
  const a = args.analysis;
  const handoffState = severityToHandoff(a.severity);
  const autoPause = args.bot?.escalationAutoPause !== false && handoffState === "human_required";
  const reason = a.reasons.join(",") || a.trigger || "negative_sentiment";
  const now = new Date();

  // Dedupe: keep one active ticket per conversation; append timeline instead
  // of creating alert storms while the customer is upset.
  let ticket = await (prisma as any).escalationTicket.findFirst({
    where: {
      userId: args.userId,
      conversationId: args.conversationId,
      status: { in: ["open", "acknowledged", "human_active"] },
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);

  if (!ticket) {
    ticket = await (prisma as any).escalationTicket.create({
      data: {
        userId: args.userId,
        customerId: args.customerId,
        conversationId: args.conversationId,
        status: "open",
        handoffState,
        severity: a.severity,
        reason,
        trigger: a.trigger,
        sentiment: a.sentiment,
        angerScore: a.angerScore,
        confidenceScore: a.confidenceScore,
        frustrationScore: a.frustrationScore,
        summary: escalationTitle(a),
        lastCustomerMessage: args.messageText.slice(0, 1000),
      },
    });
    await (prisma as any).escalationTimeline.create({
      data: {
        ticketId: ticket.id,
        userId: args.userId,
        kind: "created",
        actor: "system",
        message: escalationTitle(a),
        payload: safeJson({ analysis: a, sourceMessageId: args.sourceMessageId || null }),
      },
    }).catch(() => {});
  } else {
    ticket = await (prisma as any).escalationTicket.update({
      where: { id: ticket.id },
      data: {
        handoffState,
        severity: a.severity,
        reason,
        trigger: a.trigger,
        sentiment: a.sentiment,
        angerScore: a.angerScore,
        confidenceScore: a.confidenceScore,
        frustrationScore: a.frustrationScore,
        lastCustomerMessage: args.messageText.slice(0, 1000),
      },
    });
    await (prisma as any).escalationTimeline.create({
      data: {
        ticketId: ticket.id,
        userId: args.userId,
        kind: "note",
        actor: "system",
        message: "رسالة جديدة أضيفت لتذكرة التصعيد الحالية.",
        payload: safeJson({ analysis: a, text: args.messageText.slice(0, 500), sourceMessageId: args.sourceMessageId || null }),
      },
    }).catch(() => {});
  }

  await Promise.all([
    (prisma as any).conversation.update({
      where: { id: args.conversationId },
      data: {
        handoffState,
        handoffReason: reason,
        escalationTicketId: ticket.id,
        lastEscalatedAt: now,
        ...(autoPause ? { botPaused: true } : {}),
      },
    }).catch(() => {}),
    (prisma as any).customer.update({
      where: { id: args.customerId },
      data: { lastEscalationAt: now, frustrationScore: a.frustrationScore, lastSentiment: a.sentiment, lastIntent: a.intent } as any,
    }).catch(() => {}),
    (prisma as any).safetyAudit.create({
      data: {
        userId: args.userId,
        level: a.severity === "critical" || a.severity === "high" ? "critical" : "warn",
        category: "escalation",
        title: escalationTitle(a),
        detail: `${args.customerName || args.customerPhone || "عميل"}: ${args.messageText.slice(0, 300)}`,
        payload: safeJson({ ticketId: ticket.id, handoffState, autoPause, angerScore: a.angerScore, confidenceScore: a.confidenceScore }),
      },
    }).catch(() => {}),
  ]);

  bump("escalation_created", args.userId);
  bump(`sentiment_${a.sentiment}`, args.userId);

  notifyEscalation({
    userId: args.userId,
    ticketId: ticket.id,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
    messageText: args.messageText,
    analysis: a,
    notifyPhone: args.notifyPhone,
    emailEnabled: !!args.bot?.escalationEmailEnabled,
  }).catch(() => {});

  return { ticket, handoffState, autoPause };
}

async function notifyEscalation(args: {
  userId: string;
  ticketId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  messageText: string;
  analysis: EmotionalAnalysis;
  notifyPhone?: string | null;
  emailEnabled?: boolean;
}) {
  const to = args.notifyPhone || (await resolveNotifyPhone(args.userId));
  const text =
    `🚨 تصعيد عميل يحتاج متابعة\n\n` +
    `التذكرة: ${args.ticketId}\n` +
    `العميل: ${args.customerName || "بدون اسم"}\n` +
    `الرقم: ${args.customerPhone || "غير معروف"}\n` +
    `الشدة: ${args.analysis.severity}\n` +
    `الغضب: ${args.analysis.angerScore}/100 · الثقة: ${args.analysis.confidenceScore}/100\n` +
    `السبب: ${args.analysis.reasons.join(", ") || args.analysis.trigger}\n\n` +
    `آخر رسالة:\n"${args.messageText.slice(0, 600)}"`;

  let whatsappStatus = "not_configured";
  if (to) {
    const r = await notifyAdmin({ userId: args.userId, toPhone: to, text, category: "escalation" });
    whatsappStatus = r.ok ? "sent" : r.channel || "failed";
  }

  await (prisma as any).escalationTimeline.create({
    data: {
      ticketId: args.ticketId,
      userId: args.userId,
      kind: "notified",
      actor: "system",
      message: `WhatsApp admin alert: ${whatsappStatus}`,
      payload: safeJson({ to, whatsappStatus }),
    },
  }).catch(() => {});

  if (args.emailEnabled) {
    const user = await prisma.user.findUnique({ where: { id: args.userId }, select: { email: true } }).catch(() => null);
    if (user?.email) {
      const email = await sendCommerceEmail({
        userId: args.userId,
        to: user.email,
        subject: `KEYONE escalation: ${args.analysis.severity}`,
        html: `<div dir="rtl"><h2>تصعيد جديد</h2><p>التذكرة: ${args.ticketId}</p><p>${text.replace(/\n/g, "<br/>")}</p></div>`,
        text,
      });
      await (prisma as any).escalationTimeline.create({
        data: {
          ticketId: args.ticketId,
          userId: args.userId,
          kind: "notified",
          actor: "system",
          message: `Email admin alert: ${email.ok ? "sent" : "failed"}`,
          payload: safeJson({ to: user.email, provider: email.provider, error: email.error || null }),
        },
      }).catch(() => {});
    }
  }
}

export async function acknowledgeEscalation(args: { userId: string; ticketId: string; adminId?: string; note?: string }) {
  const ticket = await (prisma as any).escalationTicket.findFirst({ where: { id: args.ticketId, userId: args.userId } });
  if (!ticket) return null;
  const updated = await (prisma as any).escalationTicket.update({
    where: { id: ticket.id },
    data: { status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: args.adminId || args.userId },
  });
  await (prisma as any).conversation.update({
    where: { id: ticket.conversationId },
    data: { handoffState: "human_active", humanActiveAt: new Date(), botPaused: true } as any,
  }).catch(() => {});
  await (prisma as any).escalationTimeline.create({
    data: { ticketId: ticket.id, userId: args.userId, kind: "acknowledged", actor: "admin", message: args.note || "تم استلام التصعيد من الإدارة." },
  }).catch(() => {});
  bump("escalation_acknowledged", args.userId);
  return updated;
}

export async function resolveEscalation(args: { userId: string; ticketId: string; adminId?: string; note?: string; resumeAi?: boolean }) {
  const ticket = await (prisma as any).escalationTicket.findFirst({ where: { id: args.ticketId, userId: args.userId } });
  if (!ticket) return null;
  const updated = await (prisma as any).escalationTicket.update({
    where: { id: ticket.id },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  await (prisma as any).conversation.update({
    where: { id: ticket.conversationId },
    data: {
      handoffState: args.resumeAi === false ? "human_active" : "ai_active",
      handoffReason: null,
      ...(args.resumeAi === false ? {} : { botPaused: false }),
    } as any,
  }).catch(() => {});
  await (prisma as any).escalationTimeline.create({
    data: { ticketId: ticket.id, userId: args.userId, kind: "resolved", actor: "admin", message: args.note || "تم حل التصعيد." },
  }).catch(() => {});
  bump("escalation_resolved", args.userId);
  return updated;
}
