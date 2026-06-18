/**
 * Admin: read + edit Plan pricing, limits, feature flags & lifecycle.
 *
 * GET  /api/admin/plans              → list all plans with full membership fields
 * PUT  /api/admin/plans              → update one plan by slug
 *
 * Editable fields (additive only):
 *   - name, nameEn, description                 (display)
 *   - priceUsd, yearlyUsd                        (money — owner can reprice without a developer)
 *   - status: active | archived                  (lifecycle — archived hides the plan from new
 *                                                 signups/pricing; EXISTING subscribers keep their
 *                                                 entitlements because enforcement resolves by planId,
 *                                                 never by status — see lib/membership/plan.ts)
 *   - tier, aiRequestsMonthly, broadcastsMonthly, whatsappSessions
 *   - metaAccess, analyticsAccess, queuePriority, rateLimitPerMin
 *   - featureFlags (JSON object), monthlyMsgs
 *
 * Admin-only. Every mutation writes an audit row.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const PutBody = z.object({
  slug: z.string().min(1).max(64),
  // display
  name: z.string().min(1).max(120).optional(),
  nameEn: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  // money
  priceUsd: z.number().int().min(0).max(1_000_000).optional(),
  yearlyUsd: z.number().int().min(0).max(10_000_000).nullable().optional(),
  // lifecycle
  status: z.enum(["active", "archived"]).optional(),
  // limits & flags
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
      description: p.description || "",
      priceUsd: p.priceUsd,
      yearlyUsd: p.yearlyUsd ?? null,
      monthlyMsgs: p.monthlyMsgs,
      status: p.status || "active",
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
  let admin: any = null;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  const parsed = PutBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });
  }

  const { slug, featureFlags, ...rest } = parsed.data;
  const before = await prisma.plan.findUnique({ where: { slug } });
  if (!before) return NextResponse.json({ error: "plan_not_found" }, { status: 404 });

  const data: any = { ...rest };
  if (featureFlags !== undefined) data.featureFlags = JSON.stringify(featureFlags);

  await prisma.plan.update({ where: { slug }, data });

  // Pick the most specific audit verb so the lifecycle is legible in the log.
  const action =
    data.status === "archived" && (before as any).status !== "archived" ? "admin.plan_archived"
    : data.status === "active" && (before as any).status === "archived" ? "admin.plan_restored"
    : "admin.plan_changed";
  await audit({
    userId: admin?.id || "platform",
    action,
    actorId: admin?.id || null,
    actorEmail: admin?.email || null,
    actorRole: "admin",
    targetType: "plan",
    targetId: slug,
    metadata: {
      fields: Object.keys(data),
      ...(data.priceUsd !== undefined ? { priceUsd: data.priceUsd, fromPriceUsd: (before as any).priceUsd } : {}),
      ...(data.status !== undefined ? { status: data.status, fromStatus: (before as any).status || "active" } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
