/**
 * Admin: entitlement gifts for a specific customer.
 *   GET    /api/admin/users/[userId]/gifts          — list all gifts (active + expired)
 *   POST   /api/admin/users/[userId]/gifts          — grant a new gift
 *   DELETE /api/admin/users/[userId]/gifts/[id]     — revoke an unused gift (handled in [id]/route.ts)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

type Ctx = { params: { userId: string } };

const VALID_GIFT_TYPES = ["sms_credits", "ai_credits", "broadcast_credits", "days", "feature_unlock", "plan_upgrade"] as const;

export async function GET(_req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId } = ctx.params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const gifts = await (prisma as any).entitlementGift.findMany({
    where: { userId },
    orderBy: { grantedAt: "desc" },
  }).catch(() => []);

  return NextResponse.json({ ok: true, user, gifts });
}

export async function POST(req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId } = ctx.params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const type = body.type as string;
  if (!VALID_GIFT_TYPES.includes(type as any)) {
    return NextResponse.json({ error: "invalid_type", valid: VALID_GIFT_TYPES }, { status: 400 });
  }

  const amount = Number(body.amount) || 0;
  if (["sms_credits", "ai_credits", "broadcast_credits", "days"].includes(type) && amount <= 0) {
    return NextResponse.json({ error: "amount_required" }, { status: 400 });
  }

  const featureKey = type === "feature_unlock" ? String(body.featureKey || "") : null;
  if (type === "feature_unlock" && !featureKey) {
    return NextResponse.json({ error: "feature_key_required" }, { status: 400 });
  }

  const planSlug = type === "plan_upgrade" ? String(body.planSlug || "") : null;
  if (type === "plan_upgrade" && !planSlug) {
    return NextResponse.json({ error: "plan_slug_required" }, { status: 400 });
  }

  const reason = String(body.reason || body.note || "").slice(0, 500);
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const gift = await (prisma as any).entitlementGift.create({
    data: {
      userId,
      type,
      amount,
      featureKey,
      planSlug,
      expiresAt,
      used: false,
      grantedBy: admin?.email || "admin",
      source: "admin",
      reason: reason || "",
    },
  });

  await audit({
    userId,
    action: "admin.gift_granted",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "EntitlementGift",
    targetId: gift.id,
    metadata: { type, amount, featureKey, planSlug, reason, expiresAt },
    req,
  });

  return NextResponse.json({ ok: true, gift }, { status: 201 });
}
