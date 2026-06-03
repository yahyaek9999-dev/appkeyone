/**
 * Admin: approve / reject a self-service signup awaiting activation.
 *
 * POST   /api/admin/users/:userId/approve            → approve (approvalStatus="approved")
 * DELETE /api/admin/users/:userId/approve { reason? } → reject  (approvalStatus="rejected")
 *
 * Pending accounts (created via /api/auth/signup in waitlist mode) cannot log
 * in until an admin approves them here. Approval is idempotent and never
 * touches billing/subscriptions.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  await prisma.user.update({
    where: { id: params.userId },
    data: { approvalStatus: "approved", approvedAt: new Date(), approvedBy: admin.email } as any,
  });
  return NextResponse.json({ ok: true, approvalStatus: "approved" });
}

export async function DELETE(req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason || "rejected_by_admin").slice(0, 200);

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "cannot_reject_admin" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: { approvalStatus: "rejected", approvedAt: new Date(), approvedBy: admin.email, suspendedReason: reason } as any,
  });
  return NextResponse.json({ ok: true, approvalStatus: "rejected" });
}
