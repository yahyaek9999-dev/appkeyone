/**
 * Admin: set a user's PLATFORM role — user | finance | admin.
 *
 * POST /api/admin/users/:userId/role  { role: "user" | "finance" | "admin" }
 *
 * This is what lets an owner provision a FINANCE operator (payment review) or a
 * co-ADMIN entirely from the UI — no developer or direct DB edit. Previously the
 * only way to mint a finance/admin login was the seed or the env-secret recovery
 * endpoint, which made "operate without a developer" impossible for permissions.
 *
 * Guard: refuses to demote the LAST remaining admin (prevents lock-out). Every
 * change is audited for accountability.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, ASSIGNABLE_PLATFORM_ROLES } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let actor;
  try { actor = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const role = String(body?.role || "");
  if (!(ASSIGNABLE_PLATFORM_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "invalid_role", message: "الدور يجب أن يكون user أو finance أو admin." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, email: true, role: true } as any }) as any;
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // Never strip the last admin — that would lock everyone out of the admin area.
  if (target.role === "admin" && role !== "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } as any });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "last_admin", message: "لا يمكن إزالة آخر مدير — عيّن مديرًا آخر أولًا." }, { status: 400 });
    }
  }

  if (target.role === role) return NextResponse.json({ ok: true, role, unchanged: true });

  await prisma.user.update({ where: { id: params.userId }, data: { role } as any });

  void audit({
    userId: target.id, action: "admin.user_role_set", actorId: actor?.id || null, actorEmail: actor?.email || null, actorRole: "admin",
    targetType: "user", targetId: target.id, metadata: { email: target.email, from: target.role, to: role }, req,
  });

  return NextResponse.json({ ok: true, role });
}
