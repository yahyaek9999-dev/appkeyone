import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = await getUserIdForPermission("inbox");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Without ?q, the default "recent inbox" view: last 200 active customers,
  // unchanged behavior. With ?q, a real server-side search across the FULL
  // customer set (not just those 200) and the FULL message history (not just
  // each conversation's single most recent message) — previously the client
  // only filtered the already-loaded 200-row page by its last message.
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  const where: any = { userId: uid, archivedAt: null };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { phone: { contains: q } },
      { conversation: { messages: { some: { content: { contains: q } } } } },
    ];
  }

  const customers = await prisma.customer.findMany({
    // archivedAt is documented as "hidden from active views" (schema.prisma)
    // but this query never excluded it — archiving a customer never actually
    // hid their conversation from the inbox.
    where,
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    include: {
      conversation: {
        select: {
          id: true,
          updatedAt: true,
          botPaused: true,
          handoffState: true,
          escalationTicketId: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
          _count: { select: { messages: true } },
        } as any,
      },
    } as any,
  });

  return NextResponse.json({
    conversations: customers
      .filter((c: any) => c.conversation)
      .map((c: any) => ({
        customerId: c.id,
        name: c.name,
        phone: c.phone,
        leadScore: c.leadScore,
        lastIntent: c.lastIntent,
        lastSentiment: c.lastSentiment,
        botPaused: c.conversation.botPaused,
        handoffState: (c.conversation as any).handoffState || "ai_active",
        escalationTicketId: (c.conversation as any).escalationTicketId || null,
        lastMessage: c.conversation.messages[0]?.content || "",
        lastRole: c.conversation.messages[0]?.role || "user",
        lastAt:
          c.conversation.messages[0]?.createdAt || c.conversation.updatedAt,
        msgCount: c.conversation._count.messages,
      })),
  });
}
