import { prisma } from "@/lib/db";
import { TIERS } from "@/lib/pricing/catalog";
import PlansUi from "./plans-ui";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });

  // Read-only drift visibility: catalog.ts is the source of truth for NEW
  // plans (seeded create-only, never overwrites an admin's price edit — see
  // lib/pricing/seed-catalog-plans.ts), so a price mismatch here is not a
  // bug to auto-fix — it's either a deliberate admin reprice (fine) or the
  // catalog source drifting out of sync with what's live (worth a look).
  // Surfacing it is the safe fix; silently overwriting either side is not.
  const byslug = new Map(plans.map((p: any) => [p.slug, p]));
  const missingFromDb = TIERS.filter((t) => !byslug.has(t.slug)).map((t) => t.slug);
  const priceDrift = TIERS.filter((t) => {
    const row: any = byslug.get(t.slug);
    if (!row || t.priceUsdMonthly == null) return false;
    return row.priceUsd !== t.priceUsdMonthly;
  }).map((t) => ({
    slug: t.slug,
    catalogPrice: t.priceUsdMonthly as number,
    dbPrice: (byslug.get(t.slug) as any).priceUsd,
  }));

  const ui = plans.map((p: any) => ({
    slug: p.slug,
    name: p.name,
    nameEn: p.nameEn,
    description: p.description || "",
    priceUsd: p.priceUsd,
    yearlyUsd: p.yearlyUsd ?? null,
    status: p.status || "active",
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
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">الباقات والحدود</h1>
        <p className="page-desc">عدّل الحدود والـ feature flags لكل باقة. التغييرات تنطبق فوراً.</p>
      </div>
      <PlansUi initial={ui} missingFromDb={missingFromDb} priceDrift={priceDrift} />
    </div>
  );
}
