import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { resolveMemberScope, assigneeScopeIds } from "@/lib/teams/scope";

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
    // Team member — the visible slice is whatever their resolved isolation
    // allows. resolveMemberScope() returns own_only + all-numbers for a member
    // with no team and no override, which is byte-for-byte the restriction this
    // route enforced before teams existed, so nobody's view changes until an
    // owner puts them on a team.
    const resolved = await resolveMemberScope(memberId);
    const assignees = await assigneeScopeIds(memberId, resolved);

    // Built conditionally: an "all"-scope member with no number restriction gets
    // NO `conversation` filter at all, rather than an empty relation filter
    // (which Prisma would read as "a conversation must exist").
    const convWhere: any = {};
    // null = "all" scope: no assignee restriction at all.
    if (assignees) convWhere.assignedStaffId = { in: assignees };
    if (resolved.allowedNumberIds.length > 0) {
      convWhere.numberId = { in: resolved.allowedNumberIds };
    }
    if (Object.keys(convWhere).length > 0) where.conversation = convWhere;
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
