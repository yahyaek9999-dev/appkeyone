import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { evaluateSubscription, getSiteConfig } from "@/lib/admin";
import { chat as llmChat, buildMessages, detectOrderIntent } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { notifyMerchant } from "@/lib/notify";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const Body = z.object({
  customerId: z.string().nullish(),
  customerPhone: z.string().nullish(),
  customerName: z.string().nullish(),
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();

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
      conv = await prisma.conversation.create({
        data: { customerId: customer.id },
        include: { messages: true },
      });
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
    const docs = await prisma.document.findMany({ where: { userId: user.id } });
    const knowledgeBase = docs
      .map((d) => `# ${d.title}\n${d.content}`)
      .join("\n\n---\n\n");

    // Detect order intent BEFORE LLM (cheap)
    const flagged = detectOrderIntent(message, bot.orderKeywords);

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        role: "user",
        content: message,
        flagged,
      },
    });

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
    });

    // Call LLM
    let reply: string;
    try {
      reply = await llmChat(messages, { provider: botProviderOverride(bot) });
    } catch (e: any) {
      console.error("[api/chat] llmChat failed:", e?.message || e);
      reply = "عذراً، يبدو أن هناك خلل تقني مؤقت. سأعود لك خلال لحظات.";
    }

    // Save assistant message
    await prisma.message.create({
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

    // Increment subscription usage (msgs + AI requests)
    if (user.subscription) {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: {
          msgsUsed: { increment: 1 },
          aiRequestsUsed: { increment: 1 },
        } as any,
      });
    }

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
    return NextResponse.json(
      { error: e.message || "خطأ داخلي" },
      { status: 500 },
    );
  }
}
