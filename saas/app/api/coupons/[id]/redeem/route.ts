// Growth Suite — Coupon redemption. Enforces expiry / usage-limit / one-time,
// records a redemption row + attributed revenue, bumps usedCount atomically.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const coupon = await prisma.coupon.findFirst({ where: { id: params.id, userId: uid } });
  if (!coupon) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let b: any = {};
  try {
    b = await req.json();
  } catch {}
  const customerId = b.customerId ? String(b.customerId) : null;
  const orderId = b.orderId ? String(b.orderId) : null;
  const revenue = Math.max(0, Math.round(Number(b.revenue) || 0));

  // ---- Validity checks ----
  if (!coupon.active) return NextResponse.json({ error: "الكوبون غير مفعّل" }, { status: 400 });
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "انتهت صلاحية الكوبون" }, { status: 400 });
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return NextResponse.json({ error: "تم استنفاد حد استخدام الكوبون" }, { status: 400 });
  }
  if (coupon.oneTime && customerId) {
    const prior = await prisma.couponRedemption.findFirst({ where: { couponId: coupon.id, customerId } });
    if (prior) return NextResponse.json({ error: "هذا العميل استخدم الكوبون من قبل" }, { status: 400 });
  }

  await prisma.couponRedemption.create({
    data: { couponId: coupon.id, userId: uid, customerId, orderId, revenue },
  });
  const updated = await prisma.coupon.update({
    where: { id: coupon.id },
    data: { usedCount: { increment: 1 } },
  });

  return NextResponse.json({ ok: true, usedCount: updated.usedCount });
}
