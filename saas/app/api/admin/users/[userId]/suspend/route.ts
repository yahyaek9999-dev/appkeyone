/**
 * Admin: suspend / reactivate a user account.
 *
 * POST   /api/admin/users/:userId/suspend  { reason?: string }  → suspend
 * DELETE /api/admin/users/:userId/suspend                        → reactivate
 *
 * Suspension is a soft state — no data is deleted. The membership gates in
 * lib/membership/plan.ts honor it across the WA pipeline, AI calls, and
 * broadcasts. Admins themselves cannot be suspended.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let actor;
  try { actor = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "manual_admin_action").slice(0, 200);

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, email: true, role: true } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "cannot_suspend_admin" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: { suspended: true, suspendedAt: new Date(), suspendedReason: reason } as any,
  });
  void audit({
    userId: target.id, action: "admin.user_suspended", actorId: actor?.id || null, actorEmail: actor?.email || null, actorRole: "admin",
    targetType: "user", targetId: target.id, metadata: { email: target.email, reason }, req,
  });
  return NextResponse.json({ ok: true, suspended: true, reason });
}

export async function DELETE(req: Request, { params }: { params: { userId: string } }) {
  let actor;
  try { actor = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  let target: { id: string; email: string | null };
  try {
    target = await prisma.user.update({
      where: { id: params.userId },
      data: { suspended: false, suspendedAt: null, suspendedReason: null } as any,
      select: { id: true, email: true },
    });
  } catch (e: any) {
    if (e?.code === "P2025") return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    throw e;
  }
  void audit({
    userId: target.id, action: "admin.user_reactivated", actorId: actor?.id || null, actorEmail: actor?.email || null, actorRole: "admin",
    targetType: "user", targetId: target.id, metadata: { email: target.email }, req,
  });
  return NextResponse.json({ ok: true, suspended: false });
}
