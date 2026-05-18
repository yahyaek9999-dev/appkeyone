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

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "manual_admin_action").slice(0, 200);

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "cannot_suspend_admin" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: { suspended: true, suspendedAt: new Date(), suspendedReason: reason } as any,
  });
  return NextResponse.json({ ok: true, suspended: true, reason });
}

export async function DELETE(_req: Request, { params }: { params: { userId: string } }) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  await prisma.user.update({
    where: { id: params.userId },
    data: { suspended: false, suspendedAt: null, suspendedReason: null } as any,
  });
  return NextResponse.json({ ok: true, suspended: false });
}
