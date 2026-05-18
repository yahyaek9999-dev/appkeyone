/**
 * Admin: read + edit Plan limits & feature flags.
 *
 * GET  /api/admin/plans              → list all plans with full membership fields
 * PUT  /api/admin/plans              → update one plan by slug
 *
 * Editable fields (additive only — pricing/monthlyMsgs are still editable
 * via the existing subscription endpoint flow if needed):
 *   - tier, aiRequestsMonthly, broadcastsMonthly, whatsappSessions
 *   - metaAccess, analyticsAccess, queuePriority, rateLimitPerMin
 *   - featureFlags (JSON object)
 *
 * The endpoint is admin-only. Validation is strict on enums.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const PutBody = z.object({
  slug: z.string().min(1).max(64),
  tier: z.enum(["basic", "pro", "max", "companies"]).optional(),
  aiRequestsMonthly: z.number().int().min(0).optional(),
  broadcastsMonthly: z.number().int().min(0).optional(),
  whatsappSessions: z.number().int().min(1).max(9999).optional(),
  metaAccess: z.enum(["none", "limited", "full"]).optional(),
  analyticsAccess: z.enum(["basic", "advanced"]).optional(),
  queuePriority: z.number().int().min(0).max(100).optional(),
  rateLimitPerMin: z.number().int().min(1).max(10000).optional(),
  featureFlags: z.record(z.any()).optional(),
  monthlyMsgs: z.number().int().min(0).optional(),
});

export async function GET() {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({
    ok: true,
    plans: plans.map((p: any) => ({
      slug: p.slug,
      name: p.name,
      nameEn: p.nameEn,
      priceUsd: p.priceUsd,
      monthlyMsgs: p.monthlyMsgs,
      tier: p.tier || "basic",
      aiRequestsMonthly: p.aiRequestsMonthly ?? 0,
      broadcastsMonthly: p.broadcastsMonthly ?? 0,
      whatsappSessions: p.whatsappSessions ?? 1,
      metaAccess: p.metaAccess || "none",
      analyticsAccess: p.analyticsAccess || "basic",
      queuePriority: p.queuePriority ?? 0,
      rateLimitPerMin: p.rateLimitPerMin ?? 60,
      featureFlags: (() => { try { return JSON.parse(p.featureFlags || "{}"); } catch { return {}; } })(),
    })),
  });
}

export async function PUT(req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  const parsed = PutBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });
  }

  const { slug, featureFlags, ...rest } = parsed.data;
  const plan = await prisma.plan.findUnique({ where: { slug } });
  if (!plan) return NextResponse.json({ error: "plan_not_found" }, { status: 404 });

  const data: any = { ...rest };
  if (featureFlags !== undefined) data.featureFlags = JSON.stringify(featureFlags);

  await prisma.plan.update({ where: { slug }, data });
  return NextResponse.json({ ok: true });
}
