/**
 * Admin: promotions / sales engine.
 *   GET  /api/admin/promotions          — list all promotions (paginated)
 *   POST /api/admin/promotions          — create promotion
 *
 * Promotion types:
 *   - percentage discount on plan price
 *   - fixed USD discount
 *   - free days / trial extension
 *   - credit bonus (sms/ai/broadcast)
 *   - feature unlock (temporary access to a specific capability)
 *   - custom price (e.g. offer k_pro at $99 instead of $238)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { PUBLIC_TIER_ORDER } from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = 20;

  const where: any = {};
  if (status) where.status = status;

  const [total, promotions] = await Promise.all([
    (prisma as any).promotion.count({ where }).catch(() => 0),
    (prisma as any).promotion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }).catch(() => []),
  ]);

  return NextResponse.json({ ok: true, total, page, promotions });
}

export async function POST(req: Request) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const code = body.code ? String(body.code).toUpperCase().trim() : null;
  if (code) {
    const exists = await (prisma as any).promotion.findFirst({ where: { code } }).catch(() => null);
    if (exists) return NextResponse.json({ error: "code_already_exists" }, { status: 409 });
  }

  const targetPlans: string[] = [];
  try {
    const raw = JSON.parse(body.targetPlans || "[]");
    for (const s of raw) {
      if (PUBLIC_TIER_ORDER.includes(s)) targetPlans.push(s);
    }
  } catch {}

  const discountPct = body.discountPct != null ? Math.min(100, Math.max(0, Number(body.discountPct) || 0)) : null;
  const discountUsd = body.discountUsd != null ? Math.max(0, Number(body.discountUsd) || 0) : null;
  const freeDays    = body.freeDays    != null ? Math.max(0, Math.round(Number(body.freeDays) || 0)) : null;
  const creditType  = body.creditType  || null;
  const creditAmount = body.creditAmount != null ? Math.max(0, Number(body.creditAmount) || 0) : null;
  const featureKey  = body.featureKey  || null;
  const customPriceUsd = body.customPriceUsd != null ? Math.max(0, Number(body.customPriceUsd)) : null;
  const newCustomersOnly = Boolean(body.newCustomersOnly);
  const durationMonths = body.durationMonths != null ? Math.max(1, Math.round(Number(body.durationMonths) || 1)) : null;
  const usageLimit = body.usageLimit != null ? Math.max(1, Math.round(Number(body.usageLimit) || 1)) : null;
  const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;

  if (endsAt && endsAt <= startsAt) {
    return NextResponse.json({ error: "end_before_start" }, { status: 400 });
  }

  // Derive canonical type from whichever benefit field is set
  let type = body.type || "";
  if (!type) {
    if (discountPct)    type = "percentage";
    else if (discountUsd) type = "fixed_usd";
    else if (freeDays)   type = "free_period";
    else if (featureKey) type = "feature_unlock";
    else if (customPriceUsd != null) type = "custom_price";
    else if (creditType) type = "credit_bonus";
    else type = "percentage";
  }

  const promo = await (prisma as any).promotion.create({
    data: {
      name,
      code,
      type,
      discountPct: discountPct || 0,
      discountUsd: discountUsd || 0,
      freeDays: freeDays || 0,
      creditType: creditType || null,
      creditAmount: creditAmount || 0,
      featureKey: featureKey || null,
      customPriceUsd: customPriceUsd || null,
      targetPlans: JSON.stringify(targetPlans),
      newCustomersOnly,
      durationMonths: durationMonths || null,
      usageLimit: usageLimit || null,
      usedCount: 0,
      startsAt,
      endsAt,
      status: "draft",
      createdBy: admin?.email || "admin",
    },
  });

  await audit({
    userId: admin?.id || "admin",
    action: "admin.promotion_created",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "Promotion",
    targetId: promo.id,
    metadata: { name, code, discountPct, discountUsd, freeDays },
    req,
  });

  return NextResponse.json({ ok: true, promotion: promo }, { status: 201 });
}
