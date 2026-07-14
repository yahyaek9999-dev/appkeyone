// Support AI — draft reply generator for escalation tickets.
//
// THE GAP THIS CLOSES: EscalationTicket is a real human-handoff ticket system
// with zero AI assistance for the agent handling it. This generates a
// suggested reply (ticket context + recent conversation turns + KB retrieval)
// via the tenant's configured provider (aiChatWithFailover — same vault path
// as every other tenant-scoped AI call), and persists it to the ticket for
// display. It is draft-only: the human agent reviews and sends it manually
// through the existing channels — nothing here sends a WhatsApp message or
// touches the send pipeline, matching the same copy-paste pattern already
// established by Revenue Copilot / Next Best Action.
import { prisma } from "@/lib/db";
import { semanticSearch } from "@/lib/knowledge-brain/search";
import { aiChatWithFailover } from "@/lib/integrations/ai";
import type { ChatMsg } from "@/lib/providers/types";

export type DraftReplyResult =
  | { ok: true; draft: string }
  | { ok: false; reason: string };

export async function generateEscalationDraftReply(
  userId: string,
  ticketId: string,
): Promise<DraftReplyResult> {
  const ticket = await prisma.escalationTicket.findFirst({ where: { id: ticketId, userId } });
  if (!ticket) return { ok: false, reason: "not_found" };

  const recentMessages = ticket.conversationId
    ? await prisma.message.findMany({
        where: { conversationId: ticket.conversationId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { role: true, content: true },
      })
    : [];
  const transcript = recentMessages
    .reverse()
    .map((m) => `${m.role === "user" ? "العميل" : "المساعد"}: ${m.content}`)
    .join("\n")
    .slice(0, 2500);

  const kb = await semanticSearch(userId, ticket.lastCustomerMessage || ticket.summary || ticket.reason, 3).catch(
    () => ({ hits: [] as { snippet: string }[] }),
  );
  const groundedContext = kb.hits.map((h) => h.snippet).join("\n").slice(0, 1500);

  const messages: ChatMsg[] = [
    {
      role: "system",
      content:
        "أنت تساعد موظف دعم بشري في صياغة رد لعميل تم تصعيده. اكتب رداً عربياً مهذباً ومباشراً (3-5 جمل) يعالج مشكلة العميل بالاستناد لمعلومات الشركة المتاحة فقط، ولا تخترع وعوداً أو تفاصيل غير مؤكدة. أعد نص الرد فقط بدون أي شرح أو مقدمة.",
    },
    {
      role: "user",
      content: [
        `سبب التصعيد: ${ticket.reason || ticket.trigger || "غير محدد"}`,
        ticket.summary ? `ملخص: ${ticket.summary}` : "",
        transcript ? `آخر المحادثة:\n${transcript}` : `آخر رسالة من العميل: ${ticket.lastCustomerMessage}`,
        groundedContext ? `معلومات قد تفيد من قاعدة المعرفة:\n${groundedContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  const r = await aiChatWithFailover(userId, messages, { temperature: 0.5, maxTokens: 400, timeoutMs: 30000 });
  if (!r.ok) return { ok: false, reason: r.reason };

  const draft = (r.result.text || "").trim().slice(0, 2000);
  if (!draft) return { ok: false, reason: "empty_response" };

  await prisma.escalationTicket
    .update({ where: { id: ticketId }, data: { aiDraftReply: draft, aiDraftAt: new Date() } })
    .catch(() => {});

  return { ok: true, draft };
}
