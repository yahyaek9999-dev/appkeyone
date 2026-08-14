/**
 * POST /api/inbox/assign
 * Assign a conversation to a staff member (or unassign).
 * Body: { customerId, staffId?, team?, strategy? }
 * strategy: "manual" | "round_robin" | "least_loaded"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

async function resolveStaff(
  userId: string,
  team: string | null,
  strategy: "manual" | "round_robin" | "least_loaded",
  staffId: string | null,
): Promise<string | null> {
  if (staffId) {
    // Verify the staff belongs to this workspace
    const member = await prisma.teamMember.findFirst({
      where: { id: staffId, ownerId: userId, status: "active" },
      select: { id: true },
    });
    return member?.id || null;
  }

  if (strategy === "manual") return null;

  const where: any = { ownerId: userId, status: "active" };
  if (team) where.role = team; // use role as team designation when no department field exists

  const staff = await prisma.teamMember.findMany({
    where,
    select: { id: true },
    orderBy: (strategy === "round_robin" ? { lastLoginAt: "asc" } : { id: "asc" }) as any,
  }).catch(() => []);
  if (!staff.length) return null;

  if (strategy === "least_loaded") {
    const counts = await Promise.all(
      staff.map(async (s: { id: string }) => {
        const count = await (prisma as any).conversation.count({
          where: { assignedStaffId: s.id, queueState: { in: ["assigned", "open"] } },
        }).catch(() => 999);
        return { id: s.id, count };
      }),
    );
    counts.sort((a: { count: number }, b: { count: number }) => a.count - b.count);
    return counts[0].id;
  }

  return staff[0].id;
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauth" }, { status: 401 });

  if (!can(ctx.role, "team")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const userId = ctx.user.id;
  const body = await req.json().catch(() => ({}));
  const { customerId, staffId, team, strategy = "manual", slaMinutes } = body;

  if (!customerId) return NextResponse.json({ error: "customerId required" }, { status: 400 });

  const conversation = await (prisma as any).conversation.findFirst({
    where: { customerId, userId },
    select: { id: true, queueState: true },
  }).catch(() => null);

  if (!conversation) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

  const resolvedStaffId = await resolveStaff(
    userId,
    team || null,
    strategy as "manual" | "round_robin" | "least_loaded",
    staffId || null,
  );

  const update: any = {
    assignedStaffId: resolvedStaffId,
    assignedTeam: team || null,
    queueState: resolvedStaffId ? "assigned" : "open",
  };

  if (slaMinutes) {
    update.slaDeadlineAt = new Date(Date.now() + slaMinutes * 60_000);
  }

  await (prisma as any).conversation.update({
    where: { id: conversation.id },
    data: update,
  });

  return NextResponse.json({ ok: true, assignedStaffId: resolvedStaffId, queueState: update.queueState });
}

/**
 * PATCH /api/inbox/assign — update queue state only
 * Body: { customerId, queueState }
 * queueState: "open" | "assigned" | "pending" | "resolved" | "closed"
 */
export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const userId = ctx.user.id;
  const body = await req.json().catch(() => ({}));
  const { customerId, queueState } = body;

  if (!customerId || !queueState) {
    return NextResponse.json({ error: "customerId and queueState required" }, { status: 400 });
  }

  const VALID_STATES = ["open", "assigned", "pending", "resolved", "closed"];
  if (!VALID_STATES.includes(queueState)) {
    return NextResponse.json({ error: "invalid queueState" }, { status: 400 });
  }

  const conversation = await (prisma as any).conversation.findFirst({
    where: { customerId, userId },
    select: { id: true },
  }).catch(() => null);
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const update: any = { queueState };
  if (queueState === "resolved") update.resolvedAt = new Date();
  if (queueState === "closed") update.closedAt = new Date();

  await (prisma as any).conversation.update({ where: { id: conversation.id }, data: update });

  return NextResponse.json({ ok: true });
}
