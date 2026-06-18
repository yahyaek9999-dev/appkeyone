import { prisma } from "@/lib/db";
import PlansUi from "./plans-ui";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
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
        <h1 className="text-3xl font-bold mb-2">الباقات والحدود</h1>
        <p className="text-slate-400">عدّل الحدود والـ feature flags لكل باقة. التغييرات تنطبق فوراً.</p>
      </div>
      <PlansUi initial={ui} />
    </div>
  );
}
