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

import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, email: true } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  await prisma.user.update({
    where: { id: params.userId },
    data: { approvalStatus: "approved", approvedAt: new Date(), approvedBy: admin.email } as any,
  });
  void audit({
    userId: target.id, action: "admin.user_approved", actorId: (admin as any)?.id || null, actorEmail: admin.email || null, actorRole: "admin",
    targetType: "user", targetId: target.id, metadata: { email: target.email }, req,
  });
  return NextResponse.json({ ok: true, approvalStatus: "approved" });
}

export async function DELETE(req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason || "rejected_by_admin").slice(0, 200);

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, email: true, role: true } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "cannot_reject_admin" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: { approvalStatus: "rejected", approvedAt: new Date(), approvedBy: admin.email, suspendedReason: reason } as any,
  });
  void audit({
    userId: target.id, action: "admin.user_rejected", actorId: (admin as any)?.id || null, actorEmail: admin.email || null, actorRole: "admin",
    targetType: "user", targetId: target.id, metadata: { email: target.email, reason }, req,
  });
  return NextResponse.json({ ok: true, approvalStatus: "rejected" });
}
