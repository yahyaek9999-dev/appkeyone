import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("inbox");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const customers = await prisma.customer.findMany({
    // archivedAt is documented as "hidden from active views" (schema.prisma)
    // but this query never excluded it — archiving a customer never actually
    // hid their conversation from the inbox.
    where: { userId: uid, archivedAt: null } as any,
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
