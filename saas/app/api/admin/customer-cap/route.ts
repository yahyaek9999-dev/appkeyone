/**
 * Admin Customer-Cap observability + control.
 *   GET  /api/admin/customer-cap — tenants near/over their cap + enforcement flag
 *   POST /api/admin/customer-cap — { userId, contractedCustomers } set the grandfather floor
 * Admin-only; POST is audited. Never deletes customers; only raises/sets the floor.
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { overCapTenants, getCustomerCapState, customerCapEnforcementEnabled } from "@/lib/membership/customer-cap";

export const dynamic = "force-dynamic";

export async function GET() {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  try {
    const rows = await overCapTenants({ limit: 100 });
    const userIds = rows.map((r) => r.userId);
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return NextResponse.json({
      ok: true,
      enforcement: customerCapEnforcementEnabled(),
      rows: rows.map((r) => ({ ...r, user: byId.get(r.userId) || null })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const userId = String(body.userId || "");
  if (!userId) return NextResponse.json({ error: "missing_user" }, { status: 400 });
  const raw = body.contractedCustomers;
  const contracted = raw === null || raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0));

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return NextResponse.json({ error: "no_subscription" }, { status: 404 });

  await prisma.subscription.update({ where: { userId }, data: { contractedCustomers: contracted } });
  await audit({ userId, action: "admin.customer_cap_set", actorId: admin?.id || null, actorEmail: admin?.email || "admin", actorRole: "admin", targetType: "subscription", targetId: userId, metadata: { contractedCustomers: contracted }, req });

  const state = await getCustomerCapState(userId);
  return NextResponse.json({ ok: true, state });
}
