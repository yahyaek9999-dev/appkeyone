import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const { userId } = params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

  // Never delete a platform-admin (incl. yourself) — a hard delete of the last
  // admin locks the whole platform out of its admin panel (recoverable only via
  // /api/admin/init). Mirrors the guard already present on the suspend endpoint.
  if ((user as any).role === "admin") {
    return NextResponse.json({ error: "cannot_delete_admin" }, { status: 400 });
  }
  if (userId === (admin as any).id) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  // Soft-delete: never hard-delete a tenant — the User row cascades to 50+
  // tables and would irreversibly wipe the financial ledger, invoices, usage
  // records and audit trail (the append-only "truth" tables). Mark the account
  // deleted + suspended (suspension already blocks all access in getAuthContext);
  // every financial/audit record is preserved and the row leaves the active list.
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      suspended: true,
      suspendedAt: new Date(),
      suspendedReason: "deleted_by_admin",
    },
  });
  void audit({
    userId, action: "admin.user_soft_deleted", actorId: (admin as any)?.id || null, actorEmail: (admin as any)?.email || null, actorRole: "admin",
    targetType: "user", targetId: userId, metadata: { email: user.email }, req,
  });
  return NextResponse.json({ ok: true, softDeleted: true });
}
