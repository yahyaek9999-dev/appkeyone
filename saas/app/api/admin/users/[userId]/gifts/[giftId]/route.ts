/**
 * Admin: single gift operations.
 *   DELETE /api/admin/users/[userId]/gifts/[giftId] — revoke an unused gift
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

type Ctx = { params: { userId: string; giftId: string } };

export async function DELETE(req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId, giftId } = ctx.params;

  const gift = await (prisma as any).entitlementGift.findFirst({
    where: { id: giftId, userId },
  }).catch(() => null);

  if (!gift) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (gift.used) return NextResponse.json({ error: "already_used" }, { status: 409 });

  await (prisma as any).entitlementGift.delete({ where: { id: giftId } });

  await audit({
    userId,
    action: "admin.gift_revoked",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "EntitlementGift",
    targetId: giftId,
    metadata: { type: gift.type },
    req,
  });

  return NextResponse.json({ ok: true, revoked: true });
}
