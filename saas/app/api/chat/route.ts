import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { evaluateSubscription, getSiteConfig } from "@/lib/admin";
import { chat as llmChat, buildMessages, detectOrderIntent } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { resolveAiOverrides } from "@/lib/integrations/ai";
import { notifyMerchant } from "@/lib/notify";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { retrieveRelevantKb } from "@/lib/kb-cache";
import {
  analyzeCustomerMessage,
  customerEscalationReply,
  emotionalPromptBlock,
} from "@/lib/sentiment";
import { createEscalationTicket } from "@/lib/escalation";
import { recordUsage, usageIdempotencyKey } from "@/lib/usage-ledger";

const Body = z.object({
  customerId: z.string().nullish(),
  customerPhone: z.string().nullish(),
  customerName: z.string().nullish(),
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  try {
    const user = await requirePermission("inbox");

    // ---- Suspension gate (membership foundation) ----
    if ((user as any).suspended) {
      return NextResponse.json(
        { error: "الحساب معلّق. تواصل مع الدعم لإعادة التفعيل." },
        { status: 403 },
      );
    }

    const limited = enforceRateLimit(req, {
      name: "chat",
      identifier: user.id,
      ...RATE_LIMITS.chat,
    });
    if (limited) return limited;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

    let { customerId, customerPhone, customerName, message } = parsed.data;

    // Resolve / create customer
    let customer;
    if (customerId) {
      customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });
      if (!customer || customer.userId !== user.id) {
        return NextResponse.json(
          { error: "العميل غير موجود" },
          { status: 404 },
        );
      }
    } else if (customerPhone) {
      customer = await prisma.customer.upsert({
        where: { userId_phone: { userId: user.id, phone: customerPhone } },
        update: { lastSeenAt: new Date(), name: customerName ?? undefined },
        create: { userId: user.id, phone: customerPhone, name: customerName },
      });
    } else {
      return NextResponse.json(
        { error: "customerId أو customerPhone مطلوب" },
        { status: 400 },
      );
    }

    // Get/create conversation
    let conv = await prisma.conversation.findUnique({
      where: { customerId: customer.id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } },
    });
    if (!conv) {
      try {
        conv = await prisma.conversation.create({
          data: { customerId: customer.id },
          include: { messages: true },
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          conv = await prisma.conversation.findUnique({
            where: { customerId: customer.id },
            include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } },
          });
        } else {
          throw e;
        }
      }
    }
    if (!conv) {
      return NextResponse.json({ error: "conversation_unavailable" }, { status: 503 });
    }

    // ---- Subscription enforcement ----
    // Block requests for users without an active subscription, or who have
    // exhausted their monthly quota, or whose plan has expired.
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
      include: { plan: true },
    });
    const check = evaluateSubscription(sub);
    if (!check.allowed) {
      const cfg = await getSiteConfig();
      const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");
      const reasons: Record<string, string> = {
        none: "حسابك غير مفعّل بعد. تواصل عبر واتساب لتفعيل الاشتراك.",
        pending:
          "اشتراكك قيد المراجعة من الإدارة. تواصل عبر واتساب لتأكيد الدفع.",
        expired: "انتهت صلاحية اشتراكك. تواصل عبر واتساب لتجديد الباقة.",
        canceled: "تم إلغاء اشتراكك. تواصل عبر واتساب للاستفسار.",
        quota: "استنفدت رسائل الباقة لهذا الشهر. ارفع الباقة عبر واتساب.",
      };
      return NextResponse.json(
        {
          error: reasons[check.reason] || "اشتراكك غير نشط",
          subscriptionStatus: check.reason,
          whatsappUrl: waNum ? `https://wa.me/${waNum}` : null,
        },
        { status: 402 }, // Payment Required
      );
    }

    // Bot config + knowledge
    const bot = await prisma.bot.findUnique({ where: { userId: user.id } });
    if (!bot)
      return NextResponse.json({ error: "البوت غير مهيأ" }, { status: 400 });
    const knowledgeBase = await retrieveRelevantKb(user.id, message, { k: 6, charBudget: 5000, minScore: 0.08 });

    // Detect order intent BEFORE LLM (cheap)
    const flagged = detectOrderIntent(message, bot.orderKeywords);
    const emotional = analyzeCustomerMessage(message, {
      recentMessages: conv.messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      lastIntent: (customer as any).lastIntent,
      lastSentiment: (customer as any).lastSentiment,
      lowConfidenceThreshold: (bot as any).escalationConfidenceFloor ?? 35,
    });

    // Save user message
    const inboundMessage = await prisma.message.create({
      data: {
        conversationId: conv.id,
        role: "user",
        content: message,
        flagged,
        intent:
          emotional.intent === "refund" || emotional.intent === "escalation"
            ? "complaint"
            : emotional.intent,
        sentiment: emotional.sentiment,
        angerScore: emotional.angerScore,
        confidenceScore: emotional.confidenceScore,
        frustrationScore: emotional.frustrationScore,
        urgencyScore: emotional.urgencyScore,
        emotionalTone: emotional.toneHint.slice(0, 160),
      } as any,
    });

    if (emotional.shouldEscalate) {
      const escalation = await createEscalationTicket({
        userId: user.id,
        customerId: customer.id,
        conversationId: conv.id,
        customerPhone: customer.phone,
        customerName: customer.name,
        messageText: message,
        analysis: emotional,
        bot,
        notifyPhone: bot.alertEnabled
          ? bot.notifyPhone || (bot as any).whatsappPhone || null
          : null,
        sourceMessageId: inboundMessage.id,
      });
      const reply = customerEscalationReply(emotional);
      const assistantMessage = await prisma.message.create({
        data: { conversationId: conv.id, role: "assistant", content: reply },
      });
      await recordUsage({
        userId: user.id,
        kind: "messages",
        source: "chat",
        reason: "escalation_reply",
        idempotencyKey: usageIdempotencyKey([
          "chat",
          user.id,
          inboundMessage.id,
          "messages",
          "escalation",
        ]),
        conversationId: conv.id,
        messageId: assistantMessage.id,
        customerId: customer.id,
        metadata: { escalationTicketId: escalation.ticket.id },
      });
      return NextResponse.json({
        ok: true,
        reply,
        flagged,
        customerId: customer.id,
        escalationTicketId: escalation.ticket.id,
      });
    }

    // Build prompt
    const messages = buildMessages({
      systemPrompt: bot.systemPrompt,
      botName: bot.name,
      persona: bot.persona,
      welcomeMessage: bot.welcomeMessage,
      knowledgeBase,
      history: conv.messages.map((m) => ({ role: m.role, content: m.content })),
      newUserMsg: message,
      customerName: customer.name,
      customerPhone: customer.phone,
      emotionalContext:
        emotional.shouldCalmFirst ||
        emotional.sentiment === "negative" ||
        emotional.sentiment === "angry"
          ? emotionalPromptBlock(emotional)
          : undefined,
    });

    // Call LLM. Prefer the universal providers vault (multi-provider failover)
    // when configured; otherwise keep the legacy single per-bot provider.
    let reply: string;
    try {
      const aiOverrides = await resolveAiOverrides(user.id).catch(() => []);
      reply = aiOverrides.length
        ? await llmChat(messages, { providers: aiOverrides, meterUserId: user.id })
        : await llmChat(messages, { provider: botProviderOverride(bot) });
    } catch (e: any) {
      console.error("[api/chat] llmChat failed:", e?.message || e);
      reply = "عذراً، يبدو أن هناك خلل تقني مؤقت. سأعود لك خلال لحظات.";
    }

    // Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conv.id,
        role: "assistant",
        content: reply,
      },
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastSeenAt: new Date() },
    });

    // Immutable billing ledger (server-side; never derived from chat history)
    await recordUsage({
      userId: user.id,
      kind: "messages",
      source: "chat",
      reason: "llm_reply",
      idempotencyKey: usageIdempotencyKey([
        "chat",
        user.id,
        inboundMessage.id,
        "messages",
        "llm",
      ]),
      conversationId: conv.id,
      messageId: assistantMessage.id,
      customerId: customer.id,
    });
    await recordUsage({
      userId: user.id,
      kind: "ai",
      source: "chat",
      reason: "llm_reply",
      idempotencyKey: usageIdempotencyKey([
        "chat",
        user.id,
        inboundMessage.id,
        "ai",
        "llm",
      ]),
      conversationId: conv.id,
      messageId: assistantMessage.id,
      customerId: customer.id,
    });

    // Send notification if order detected
    if (flagged && bot.notifyPhone) {
      await notifyMerchant({
        userId: user.id,
        toPhone: bot.notifyPhone,
        fromCustomer: { name: customer.name, phone: customer.phone },
        text: message,
      });
    }

    return NextResponse.json({
      ok: true,
      reply,
      flagged,
      customerId: customer.id,
    });
  } catch (e: any) {
    console.error("[chat] error:", e);
    if (e.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    if (e.message === "FORBIDDEN")
      return NextResponse.json({ error: "ليس لديك صلاحية" }, { status: 403 });
    return NextResponse.json(
      { error: e.message || "خطأ داخلي" },
      { status: 500 },
    );
  }
}
