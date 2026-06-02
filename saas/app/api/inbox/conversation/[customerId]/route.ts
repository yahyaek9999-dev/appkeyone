import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: { customerId: string } },
) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const customer = await prisma.customer.findFirst({
    where: { id: ctx.params.customerId, userId: uid },
    include: {
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 200 },
        },
      },
    },
  });

  if (!customer)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      leadScore: (customer as any).leadScore,
      lastIntent: (customer as any).lastIntent,
      lastSentiment: (customer as any).lastSentiment,
      tags: (() => {
        try {
          return JSON.parse((customer as any).tags || "[]");
        } catch {
          return [];
        }
      })(),
      notes: (customer as any).notes || "",
      assignedAdmin: (customer as any).assignedAdmin || null,
    },
    conversation: customer.conversation
      ? {
          id: customer.conversation.id,
          botPaused: (customer.conversation as any).botPaused,
          handoffState:
            (customer.conversation as any).handoffState || "ai_active",
          escalationTicketId:
            (customer.conversation as any).escalationTicketId || null,
          messages: customer.conversation.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            mediaType: m.mediaType,
            intent: m.intent,
            sentiment: m.sentiment,
            angerScore: m.angerScore,
            confidenceScore: m.confidenceScore,
            createdAt: m.createdAt,
          })),
        }
      : null,
  });
}
