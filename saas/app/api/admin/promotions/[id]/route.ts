/**
 * Admin: single promotion management.
 *   GET    /api/admin/promotions/[id]  — fetch promotion + redemption count
 *   PATCH  /api/admin/promotions/[id]  — update status (draft→active→paused→expired) or fields
 *   DELETE /api/admin/promotions/[id]  — delete draft promotion only
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const VALID_STATUSES = ["draft", "active", "paused", "expired"] as const;

export async function GET(_req: Request, ctx: Ctx) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const promo = await (prisma as any).promotion.findUnique({ where: { id: ctx.params.id } }).catch(() => null);
  if (!promo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const redemptions = await (prisma as any).promotionRedemption.count({
    where: { promoId: ctx.params.id },
  }).catch(() => 0);

  return NextResponse.json({ ok: true, promotion: promo, redemptions });
}

export async function PATCH(req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const promo = await (prisma as any).promotion.findUnique({ where: { id: ctx.params.id } }).catch(() => null);
  if (!promo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const updates: any = { updatedAt: new Date() };

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "invalid_status", valid: VALID_STATUSES }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.name !== undefined)      updates.name      = String(body.name).trim();
  if (body.startsAt !== undefined)  updates.startsAt  = new Date(body.startsAt);
  if (body.endsAt !== undefined)    updates.endsAt    = body.endsAt ? new Date(body.endsAt) : null;
  if (body.usageLimit !== undefined) updates.usageLimit = body.usageLimit != null ? Math.max(1, Number(body.usageLimit)) : null;
  if (body.newCustomersOnly !== undefined) updates.newCustomersOnly = Boolean(body.newCustomersOnly);

  const updated = await (prisma as any).promotion.update({ where: { id: ctx.params.id }, data: updates });

  await audit({
    userId: admin?.id || "admin",
    action: "admin.promotion_updated",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "Promotion",
    targetId: ctx.params.id,
    metadata: updates,
    req,
  });

  return NextResponse.json({ ok: true, promotion: updated });
}

export async function DELETE(req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const promo = await (prisma as any).promotion.findUnique({ where: { id: ctx.params.id } }).catch(() => null);
  if (!promo) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (promo.status !== "draft") {
    return NextResponse.json({ error: "only_draft_deletable", hint: "set status to paused then delete" }, { status: 409 });
  }

  await (prisma as any).promotion.delete({ where: { id: ctx.params.id } });

  await audit({
    userId: admin?.id || "admin",
    action: "admin.promotion_deleted",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "Promotion",
    targetId: ctx.params.id,
    metadata: { name: promo.name },
    req,
  });

  return NextResponse.json({ ok: true, deleted: true });
}
