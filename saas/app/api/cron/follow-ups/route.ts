import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chat as llmChat } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { wa } from "@/lib/wa";

export const dynamic = "force-dynamic";

const SECRET = process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";

/**
 * Triggered by a scheduled task on the VPS (every 30 minutes).
 * Sends an LLM-generated follow-up message to customers whose
 * `followUpAt` has passed and `followUpSent` is still false.
 */
export async function POST(req: Request) {
  if (req.headers.get("x-internal-secret") !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.customer.findMany({
    where: {
      followUpAt: { lte: now },
      followUpSent: false,
    } as any,
    take: 100,
    include: {
      user: { include: { bot: true, subscription: true } },
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      },
    },
  });

  let sent = 0, skipped = 0, failed = 0;
  const log: any[] = [];

  for (const c of due) {
    try {
      const sub = c.user.subscription;
      // Skip if subscription not active
      if (!sub || sub.status !== "active" || sub.expiresAt < now) {
        await markSent(c.id);
        skipped++; continue;
      }
      const bot = c.user.bot;
      if (!bot || !(bot as any).followUpsEnabled) {
        await markSent(c.id);
        skipped++; continue;
      }
      // Skip if customer replied since the follow-up was scheduled
      const lastMsg = c.conversation?.messages[0];
      if (lastMsg && lastMsg.role === "user" && new Date(lastMsg.createdAt) > new Date((c as any).followUpAt)) {
        await markSent(c.id);
        skipped++; continue;
      }

      // Build a concise follow-up prompt
      const recent = (c.conversation?.messages || [])
        .slice()
        .reverse()
        .map((m: any) => `${m.role === "user" ? "العميل" : "البوت"}: ${m.content.slice(0, 200)}`)
        .join("\n");

      const promptSys =
        `أنت مساعد المبيعات لـ "${bot.name}". اكتب رسالة متابعة قصيرة جداً (جملة أو اثنين) ` +
        `لعميل لم يرد على آخر رسالة. اللهجة: ${bot.persona}. ` +
        `لا تبدأ بـ "أهلاً" ولا تكرر التحية. اربط الرسالة بآخر موضوع تكلمتم فيه. ` +
        `اعرض المساعدة بشكل لطيف بدون ضغط. لا تستخدم emojis كثيرة. لا تخترع أي معلومات أو أسعار.`;

      const promptUser =
        `محادثتنا الأخيرة:\n${recent}\n\n` +
        `اكتب رسالة متابعة واحدة فقط (بدون شرح، بدون مقدمات).`;

      let text: string;
      try {
        text = await llmChat(
          [
            { role: "system", content: promptSys },
            { role: "user", content: promptUser },
          ],
          { provider: botProviderOverride(bot) }
        );
      } catch {
        await markSent(c.id);
        failed++; continue;
      }
      text = String(text || "").trim();
      if (!text) { await markSent(c.id); failed++; continue; }

      const r = await wa.send(c.userId, c.phone, text);
      if (r.ok) {
        if (c.conversation) {
          await prisma.message.create({
            data: { conversationId: c.conversation.id, role: "assistant", content: text },
          }).catch(() => {});
        }
        await prisma.customer.update({
          where: { id: c.id },
          data: { followUpSent: true } as any,
        });
        sent++;
        log.push({ phone: c.phone, status: "sent" });
      } else {
        await markSent(c.id);
        failed++;
        log.push({ phone: c.phone, status: "send_failed" });
      }
    } catch (e: any) {
      failed++;
      log.push({ phone: c.phone, error: e.message });
    }
  }

  return NextResponse.json({ ok: true, examined: due.length, sent, skipped, failed, log });
}

async function markSent(customerId: string) {
  await prisma.customer
    .update({ where: { id: customerId }, data: { followUpSent: true } as any })
    .catch(() => {});
}
