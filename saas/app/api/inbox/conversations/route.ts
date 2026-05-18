import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const customers = await prisma.customer.findMany({
    where: { userId: uid } as any,
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    include: {
      conversation: {
        select: {
          id: true,
          updatedAt: true,
          botPaused: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
          _count: { select: { messages: true } },
        },
      },
    },
  });

  return NextResponse.json({
    conversations: customers
      .filter((c) => c.conversation)
      .map((c: any) => ({
        customerId: c.id,
        name: c.name,
        phone: c.phone,
        leadScore: c.leadScore,
        lastIntent: c.lastIntent,
        lastSentiment: c.lastSentiment,
        botPaused: c.conversation.botPaused,
        lastMessage: c.conversation.messages[0]?.content || "",
        lastRole: c.conversation.messages[0]?.role || "user",
        lastAt: c.conversation.messages[0]?.createdAt || c.conversation.updatedAt,
        msgCount: c.conversation._count.messages,
      })),
  });
}
