/**
 * Admin: create any missing k_* catalog plans (see lib/pricing/seed-catalog-plans.ts).
 * Create-only — never overwrites an existing row's price/limits, so this is
 * always safe to run again, e.g. after adding a new tier to catalog.ts.
 *
 * POST /api/admin/plans/seed-catalog → { ok, created: string[], alreadyExisted: string[] }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { seedCatalogPlans } from "@/lib/pricing/seed-catalog-plans";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const result = await seedCatalogPlans(prisma);
  if (result.created.length) {
    await audit({
      userId: admin.id,
      action: "admin.plan_changed",
      actorId: admin.id,
      actorEmail: (admin as any).email || null,
      actorRole: "admin",
      targetType: "plan",
      metadata: { seedCatalog: true, created: result.created },
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true, ...result });
}
