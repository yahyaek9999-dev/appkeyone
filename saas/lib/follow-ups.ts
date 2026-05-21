import { prisma } from "@/lib/db";
import { chat as llmChat } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { wa } from "@/lib/wa";
import { recordUsage, usageIdempotencyKey } from "@/lib/usage-ledger";
import { isOptOut } from "@/lib/sentiment";

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

function inferKind(text: string, intent?: string | null): string {
  const t = String(text || "").toLowerCase();
  if (/هفكر|بفكر|مش متاكد|مش متأكد|maybe|later|not sure/.test(t))
    return "hesitation_recovery";
  if (/سعر|بكام|price|كام/.test(t)) return "price_question";
  if (/اوردر|طلب|order|دفع|تحويل/.test(t) || intent === "buy")
    return "pending_order";
  if (/صوره|صورة|منتج|product|مقاس|لون/.test(t)) return "product_view";
  return "abandoned_conversation";
}

export async function queueSmartFollowUp(args: {
  userId: string;
  customerId: string;
  conversationId?: string | null;
  messageText: string;
  intent?: string | null;
  sentiment?: string | null;
  delayHours: number;
  reason?: string;
}) {
  if (isOptOut(args.messageText)) {
    await prisma.customer
      .update({
        where: { id: args.customerId },
        data: { optedOutAt: new Date() } as any,
      })
      .catch(() => {});
    return { queued: false, reason: "opt_out" };
  }

  const [customer, pending] = await Promise.all([
    prisma.customer
      .findUnique({
        where: { id: args.customerId },
        select: { optedOutAt: true, followUpCount: true } as any,
      })
      .catch(() => null) as any,
    (prisma as any).followUpTask
      .findFirst({
        where: {
          customerId: args.customerId,
          status: { in: ["queued", "processing"] },
        },
        select: { id: true },
      })
      .catch(() => null),
  ]);
  if (customer?.optedOutAt) return { queued: false, reason: "opted_out" };
  if (pending) return { queued: false, reason: "already_queued" };

  const kind = inferKind(args.messageText, args.intent);
  const dueAt = new Date(
    Date.now() +
      Math.max(1, Math.min(168, args.delayHours || 24)) * 60 * 60 * 1000,
  );
  const idempotencyKey = usageIdempotencyKey([
    "followup",
    args.customerId,
    kind,
    args.conversationId || "",
  ]);
  const priority =
    kind === "pending_order"
      ? 85
      : kind === "price_question"
        ? 75
        : kind === "hesitation_recovery"
          ? 65
          : kind === "product_view"
            ? 55
            : 40;

  try {
    const task = await (prisma as any).followUpTask.upsert({
      where: { idempotencyKey },
      create: {
        userId: args.userId,
        customerId: args.customerId,
        conversationId: args.conversationId || null,
        kind,
        status: "queued",
        dueAt,
        priority,
        reason: args.reason || kind,
        context: safeJson({
          lastMessage: args.messageText.slice(0, 700),
          intent: args.intent,
          sentiment: args.sentiment,
        }),
        idempotencyKey,
      },
      update: {
        dueAt,
        status: "queued",
        reason: args.reason || kind,
        context: safeJson({
          lastMessage: args.messageText.slice(0, 700),
          intent: args.intent,
          sentiment: args.sentiment,
        }),
      },
    });
    return { queued: true, task };
  } catch {
    return { queued: false, reason: "write_failed" };
  }
}

export async function markFollowUpsConvertedForCustomer(customerId: string) {
  await (prisma as any).followUpTask
    .updateMany({
      where: { customerId, status: { in: ["queued", "processing"] } },
      data: { status: "converted", convertedAt: new Date() },
    })
    .catch(() => {});
}

export async function processFollowUpTask(task: any, now: Date = new Date()) {
  const claimed = await (prisma as any).followUpTask
    .updateMany({
      where: { id: task.id, status: "queued", dueAt: { lte: now } },
      data: { status: "processing", attempts: { increment: 1 } },
    })
    .catch(() => ({ count: 0 }));
  if (!claimed?.count) return { status: "skipped", reason: "not_claimed" };

  const full = await (prisma as any).followUpTask
    .findUnique({
      where: { id: task.id },
    })
    .catch(() => null);

  const customer = (await prisma.customer
    .findUnique({ where: { id: full?.customerId || task.customerId } })
    .catch(() => null)) as any;
  if (!customer) return failTask(task.id, "customer_missing", true);
  if (customer.optedOutAt) return skipTask(task.id, "customer_opted_out");

  const user = (await prisma.user.findUnique({
    where: { id: task.userId },
    include: { bot: true, subscription: true },
  })) as any;
  const bot = user?.bot;
  const sub = user?.subscription;
  if (!user || !bot) return failTask(task.id, "user_or_bot_missing", true);
  if (!sub || sub.status !== "active" || sub.expiresAt < now)
    return skipTask(task.id, "subscription_inactive");
  if (!bot.followUpsEnabled) return skipTask(task.id, "followups_disabled");
  if ((customer.followUpCount || 0) >= (bot.followUpMaxPerCustomer || 2))
    return skipTask(task.id, "customer_followup_cap");

  const conv = task.conversationId
    ? await prisma.conversation
        .findUnique({
          where: { id: task.conversationId },
          include: { messages: { orderBy: { createdAt: "desc" }, take: 12 } },
        })
        .catch(() => null)
    : await prisma.conversation
        .findUnique({
          where: { customerId: task.customerId },
          include: { messages: { orderBy: { createdAt: "desc" }, take: 12 } },
        })
        .catch(() => null);

  const lastMsg = conv?.messages?.[0];
  if (
    lastMsg &&
    lastMsg.role === "user" &&
    new Date(lastMsg.createdAt) > new Date(task.createdAt)
  ) {
    return skipTask(task.id, "customer_replied_after_queue");
  }
  if (
    lastMsg &&
    lastMsg.role !== "user" &&
    new Date(lastMsg.createdAt).getTime() > Date.now() - 6 * 60 * 60 * 1000
  ) {
    return skipTask(task.id, "recent_outbound_guard");
  }

  const recent = (conv?.messages || [])
    .slice()
    .reverse()
    .map(
      (m: any) =>
        `${m.role === "user" ? "العميل" : "البوت"}: ${String(m.content || "").slice(0, 220)}`,
    )
    .join("\n");

  let text = buildRuleBasedFollowUp({ task: full || task, customer });

  if (!text) {
    const promptSys =
      `أنت موظف مبيعات بشري لمتجر/شركة "${bot.name}". اكتب رسالة متابعة واتساب قصيرة جداً ومفيدة. ` +
      `الهدف: ${task.kind}. لا تضغط على العميل، لا تكرر التحية، لا تخترع أسعاراً، ولا ترسل أكثر من سؤال واحد. ` +
      `لو العميل كان متضايقاً اجعل الرسالة أهدأ. اللهجة: ${bot.persona}.`;
    const promptUser = `آخر سياق:\n${recent}\n\nاكتب رسالة متابعة واحدة فقط، جملة أو جملتين، بدون شرح.`;

    try {
      text = await llmChat(
        [
          { role: "system", content: promptSys },
          { role: "user", content: promptUser },
        ],
        {
          provider: botProviderOverride(bot),
          meterUserId: task.userId,
          maxTokens: 120,
        },
      );
    } catch (e: any) {
      return retryOrFail(task, e?.message || "llm_failed");
    }
  }

  text = String(text || "")
    .trim()
    .slice(0, 900);
  if (!text) return retryOrFail(task, "empty_followup");

  const r = await wa.send(task.userId, customer.phone, text);
  if (!r.ok)
    return retryOrFail(
      task,
      typeof r.data === "string"
        ? r.data
        : JSON.stringify(r.data || {}).slice(0, 400),
    );

  if (conv?.id) {
    await prisma.message
      .create({
        data: { conversationId: conv.id, role: "assistant", content: text },
      })
      .catch(() => {});
  }
  await Promise.all([
    (prisma as any).followUpTask
      .update({
        where: { id: task.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          generatedText: text,
          lastError: null,
        },
      })
      .catch(() => {}),
    prisma.customer
      .update({
        where: { id: customer.id },
        data: { followUpSent: true, followUpCount: { increment: 1 } } as any,
      })
      .catch(() => {}),
    recordUsage({
      userId: task.userId,
      kind: "messages",
      source: "followup",
      reason: task.kind,
      idempotencyKey: usageIdempotencyKey(["followup", task.id, "message"]),
      conversationId: conv?.id || task.conversationId || null,
      customerId: customer.id,
      metadata: { taskId: task.id },
    }),
  ]);
  return { status: "sent", text };
}

function parseTaskContext(task: any): any {
  try {
    return JSON.parse(task?.context || "{}");
  } catch {
    return {};
  }
}

function buildRuleBasedFollowUp(args: { task: any; customer: any }): string {
  const task = args.task || {};
  const ctx = parseTaskContext(task);
  const sentiment = String(ctx.sentiment || "").toLowerCase();
  const name = args.customer?.name ? `${args.customer.name}، ` : "";

  if (sentiment === "angry") {
    return `${name}مش حابب أزعجك، بس حبيت أتأكد إن الموضوع اتحل أو محتاج مني أوصل تفاصيلك للفريق؟`;
  }
  if (sentiment === "negative") {
    return `${name}حبيت أتابع بهدوء بخصوص آخر نقطة. تحب أوضحلك حاجة واحدة تساعدك تقرر؟`;
  }

  switch (String(task.kind || "")) {
    case "price_question":
      return `${name}كنت بتأكد إن تفاصيل السعر وصلتلك. تحب أساعدك تختار الأنسب حسب احتياجك؟`;
    case "pending_order":
      return `${name}حبيت أتابع بخصوص الطلب. لو لسه مناسب لك، ابعتلي البيانات الناقصة ونثبته فوراً.`;
    case "hesitation_recovery":
      return `${name}ولا يهمك خد وقتك. لو في نقطة مخلياك متردد، ابعتهالي وأوضحها لك بسرعة.`;
    case "product_view":
      return `${name}لسه مهتم بالمنتج اللي سألت عنه؟ أقدر أوضحلك المقاس أو التفاصيل في رسالة واحدة.`;
    case "abandoned_conversation":
      return `${name}حبيت أتابع معاك، لو لسه محتاج تفاصيل أو ترشيح مناسب أنا جاهز أساعدك.`;
    default:
      return "";
  }
}

async function skipTask(id: string, reason: string) {
  await (prisma as any).followUpTask
    .update({
      where: { id },
      data: { status: "skipped", skippedAt: new Date(), lastError: reason },
    })
    .catch(() => {});
  return { status: "skipped", reason };
}

async function failTask(id: string, reason: string, terminal = false) {
  await (prisma as any).followUpTask
    .update({
      where: { id },
      data: {
        status: terminal ? "failed" : "queued",
        failedAt: terminal ? new Date() : null,
        lastError: reason,
      },
    })
    .catch(() => {});
  return { status: terminal ? "failed" : "queued", reason };
}

async function retryOrFail(task: any, reason: string) {
  const attempts = (task.attempts || 0) + 1;
  const terminal = attempts >= (task.maxAttempts || 2);
  await (prisma as any).followUpTask
    .update({
      where: { id: task.id },
      data: terminal
        ? {
            status: "failed",
            failedAt: new Date(),
            lastError: reason.slice(0, 500),
          }
        : {
            status: "queued",
            dueAt: new Date(Date.now() + 60 * 60 * 1000),
            lastError: reason.slice(0, 500),
          },
    })
    .catch(() => {});
  return { status: terminal ? "failed" : "retry", reason };
}
