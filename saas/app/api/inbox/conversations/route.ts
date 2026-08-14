import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const uid = ctx.user.id;
  const isMember = !ctx.isOwner;
  const memberId = ctx.member?.id;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const queueState = req.nextUrl.searchParams.get("queue") || "";
  const assignedTo = req.nextUrl.searchParams.get("assigned") || "";

  const where: any = { userId: uid, archivedAt: null };

  if (isMember && memberId) {
    // Team member — restrict to own assigned conversations
    where.conversation = { assignedStaffId: memberId };

    // Number-level access: if the member has an allowedNumberIds restriction,
    // filter to only conversations on those numbers. Empty list = all numbers.
    try {
      const memberRow = await (prisma as any).teamMember.findUnique({
        where: { id: memberId },
        select: { allowedNumberIds: true },
      });
      if (memberRow) {
        const allowed: string[] = JSON.parse(memberRow.allowedNumberIds || "[]");
        if (allowed.length > 0) {
          where.conversation.numberId = { in: allowed };
        }
      }
    } catch {
      // Fail-open: if lookup fails, don't block member from seeing their conversations
    }
  }

  if (q) {
    where.OR = [
      { name: { contains: q } },
      { phone: { contains: q } },
      { conversation: { messages: { some: { content: { contains: q } } } } },
    ];
  }

  // Optional queue-state filter (e.g. ?queue=open, ?queue=assigned, ?queue=resolved)
  if (queueState) {
    if (!where.conversation) where.conversation = {};
    where.conversation.queueState = queueState;
  }

  // Optional staff filter (admin drill-down: ?assigned=<staffId>)
  if (assignedTo && !isMember) {
    if (!where.conversation) where.conversation = {};
    where.conversation.assignedStaffId = assignedTo;
  }

  const customers = await prisma.customer.findMany({
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
          queueState: true,
          assignedStaffId: true,
          assignedTeam: true,
          firstReplyAt: true,
          slaDeadlineAt: true,
          resolvedAt: true,
          closedAt: true,
          activeFlowExecId: true,
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

  const now = Date.now();

  return NextResponse.json({
    conversations: customers
      .filter((c: any) => c.conversation)
      .map((c: any) => {
        const conv: any = c.conversation;
        const slaDeadline = conv.slaDeadlineAt ? new Date(conv.slaDeadlineAt).getTime() : null;
        const slaBreached = slaDeadline ? now > slaDeadline : false;
        const slaMinsLeft = slaDeadline ? Math.round((slaDeadline - now) / 60_000) : null;

        return {
          customerId: c.id,
          name: c.name,
          phone: c.phone,
          leadScore: c.leadScore,
          lastIntent: c.lastIntent,
          lastSentiment: c.lastSentiment,
          botPaused: conv.botPaused,
          handoffState: conv.handoffState || "ai_active",
          escalationTicketId: conv.escalationTicketId || null,
          queueState: conv.queueState || "open",
          assignedStaffId: conv.assignedStaffId || null,
          assignedTeam: conv.assignedTeam || null,
          activeFlowExecId: conv.activeFlowExecId || null,
          sla: {
            deadline: conv.slaDeadlineAt || null,
            breached: slaBreached,
            minsLeft: slaMinsLeft,
          },
          resolvedAt: conv.resolvedAt || null,
          closedAt: conv.closedAt || null,
          firstReplyAt: conv.firstReplyAt || null,
          lastMessage: conv.messages[0]?.content || "",
          lastRole: conv.messages[0]?.role || "user",
          lastAt: conv.messages[0]?.createdAt || conv.updatedAt,
          msgCount: conv._count.messages,
        };
      }),
  });
}
