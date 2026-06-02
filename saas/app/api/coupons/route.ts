// Growth Suite — Coupon Engine (list + create). Includes derived tracking
// (offered / used / revenue / conversion). userId-scoped, additive.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const coupons = await prisma.coupon.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  // Revenue per coupon from redemptions (single grouped query).
  const rev = await prisma.couponRedemption
    .groupBy({ by: ["couponId"], where: { userId: uid }, _sum: { revenue: true } })
    .catch(() => [] as { couponId: string; _sum: { revenue: number | null } }[]);
  const revMap = new Map(rev.map((r) => [r.couponId, r._sum.revenue || 0]));

  const items = coupons.map((c) => ({
    ...c,
    revenue: revMap.get(c.id) || 0,
    conversionPct: c.offeredCount > 0 ? Math.round((c.usedCount / c.offeredCount) * 1000) / 10 : 0,
  }));
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let b: any = {};
  try {
    b = await req.json();
  } catch {}
  const code = String(b.code || "").trim().toUpperCase().slice(0, 40);
  if (!code) return NextResponse.json({ error: "كود الكوبون مطلوب" }, { status: 400 });
  const type = b.type === "fixed" ? "fixed" : "percent";
  let value = Math.max(0, Math.round(Number(b.value) || 0));
  if (type === "percent") value = Math.min(100, value);

  const existing = await prisma.coupon.findFirst({ where: { userId: uid, code }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 409 });

  let expiresAt: Date | null = null;
  if (b.expiresAt) {
    const d = new Date(b.expiresAt);
    if (!isNaN(d.getTime())) expiresAt = d;
  }

  const coupon = await prisma.coupon.create({
    data: {
      userId: uid,
      code,
      type,
      value,
      expiresAt,
      usageLimit: b.usageLimit != null && b.usageLimit !== "" ? Math.max(1, Math.round(Number(b.usageLimit))) : null,
      oneTime: !!b.oneTime,
      autoOffer: !!b.autoOffer,
      active: b.active !== false,
      note: b.note ? String(b.note).slice(0, 200) : null,
    },
  });
  return NextResponse.json({ ok: true, coupon });
}
