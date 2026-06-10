// Growth Suite — Coupon redemption. Enforces expiry / usage-limit / one-time,
// records a redemption row + attributed revenue, bumps usedCount atomically.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await apiGate("smart_campaign_builder");
  if (gate.response) return gate.response;
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

  // ---- Validity checks (fast-path; the authoritative limit check is the
  //      atomic conditional update below) ----
  if (!coupon.active) return NextResponse.json({ error: "الكوبون غير مفعّل" }, { status: 400 });
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "انتهت صلاحية الكوبون" }, { status: 400 });
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return NextResponse.json({ error: "تم استنفاد حد استخدام الكوبون" }, { status: 400 });
  }

  // Tenant-scope the foreign references: customerId/orderId come from the request
  // body, so verify they belong to THIS tenant before persisting them (otherwise
  // a tenant could record a redemption against a guessed foreign customer/order
  // id and pollute their own oneTime-eligibility / attribution data).
  if (customerId) {
    const owned = await prisma.customer.findFirst({ where: { id: customerId, userId: uid }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "invalid_customer" }, { status: 400 });
  }
  if (orderId) {
    const owned = await (prisma as any).order.findFirst({ where: { id: orderId, userId: uid }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "invalid_order" }, { status: 400 });
  }

  if (coupon.oneTime && customerId) {
    const prior = await prisma.couponRedemption.findFirst({ where: { couponId: coupon.id, customerId } });
    if (prior) return NextResponse.json({ error: "هذا العميل استخدم الكوبون من قبل" }, { status: 400 });
  }

  // ---- Atomic claim ----
  // Two concurrent requests must not both pass the usedCount check above and
  // both increment past usageLimit (TOCTOU). The conditional updateMany makes
  // the check-and-increment a single atomic SQL statement: only one writer can
  // flip the counter while usedCount < usageLimit. count===0 ⇒ limit reached.
  if (coupon.usageLimit != null) {
    const claim = await prisma.coupon.updateMany({
      where: { id: coupon.id, userId: uid, usedCount: { lt: coupon.usageLimit } },
      data: { usedCount: { increment: 1 } },
    });
    if (claim.count === 0) {
      return NextResponse.json({ error: "تم استنفاد حد استخدام الكوبون" }, { status: 400 });
    }
  } else {
    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  await prisma.couponRedemption.create({
    data: { couponId: coupon.id, userId: uid, customerId, orderId, revenue },
  });
  const fresh = await prisma.coupon.findUnique({ where: { id: coupon.id }, select: { usedCount: true } });

  return NextResponse.json({ ok: true, usedCount: fresh?.usedCount ?? coupon.usedCount + 1 });
}
