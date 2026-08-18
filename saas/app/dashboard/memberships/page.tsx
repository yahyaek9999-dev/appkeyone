import { promises as fs } from 'fs';
import path from 'path';
import { getAuthContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PUBLIC_TIERS } from '@/lib/pricing/catalog';
import MembershipsClient from './MembershipsClient';

export const metadata = { title: 'Memberships | KEYONE Admin' };

const PUBLIC_SLUGS = new Set(PUBLIC_TIERS.map((t: any) => t.slug));

const TIER_INDEX: Record<string, number> = {
  k_start: 0,
  k_growth: 1,
  k_pro: 2,
  k_enterprise: 3,
};

export default async function MembershipsPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isOwner && (ctx.user as any).role === 'admin';
  if (!isAdmin) redirect('/dashboard');

  const [allPlans, promos, subCounts] = await Promise.all([
    prisma.plan.findMany({ orderBy: { priceUsd: 'asc' } }),
    prisma.promotion.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.subscription.groupBy({ by: ['planId'], _count: { _all: true } }),
  ]);

  const countMap: Record<string, number> = {};
  for (const row of subCounts) {
    countMap[row.planId] = (row._count as any)._all ?? 0;
  }

  const toShape = (p: any) => ({
    slug: p.slug,
    name: p.name ?? '',
    nameEn: p.nameEn ?? p.name ?? '',
    description: p.description ?? '',
    priceUsd: p.priceUsd ?? 0,
    yearlyUsd: p.yearlyUsd ?? null,
    monthlyMsgs: p.monthlyMsgs ?? 0,
    status: p.status ?? 'active',
    tier: p.tier ?? 'basic',
    aiRequestsMonthly: p.aiRequestsMonthly ?? 0,
    broadcastsMonthly: p.broadcastsMonthly ?? 0,
    whatsappSessions: p.whatsappSessions ?? 1,
    metaAccess: p.metaAccess ?? 'none',
    analyticsAccess: p.analyticsAccess ?? 'basic',
    queuePriority: p.queuePriority ?? 0,
    rateLimitPerMin: p.rateLimitPerMin ?? 60,
    featureFlags: (() => { try { return JSON.parse(p.featureFlags || '{}'); } catch { return {}; } })(),
  });

  const publicPlans = allPlans.filter((p: any) => PUBLIC_SLUGS.has(p.slug)).map(toShape);
  const legacyPlans = allPlans.filter((p: any) => !PUBLIC_SLUGS.has(p.slug)).map(toShape);

  const promotions = promos.map((p: any) => ({
    id: p.id,
    code: p.code ?? '(auto)',
    type: p.type,
    value: p.type === 'percentage' ? p.discountPct : p.type === 'fixed_usd' ? p.discountUsd : p.creditAmount,
    targetPlan: (() => { try { const arr = JSON.parse(p.targetPlans || '[]'); return arr[0] ?? null; } catch { return null; } })(),
    status: p.status ?? 'active',
    expiresAt: p.expiresAt?.toISOString() ?? null,
    usageCount: p.usedCount ?? 0,
    maxUsage: p.usageLimit ?? null,
  }));

  // Load registry for "Features by Plan" matrix
  const registryPath = path.join(process.cwd(), '../project-knowledge/master-feature-registry.json');
  let registry: any[] = [];
  try {
    const raw = await fs.readFile(registryPath, 'utf-8');
    registry = JSON.parse(raw);
  } catch {
    registry = [];
  }

  // Customer-facing features only (exclude admin_internal)
  const customerFeatures = registry.filter(
    (f: any) => f.type !== 'admin_internal' && f.customerVisible !== false
  );

  // Build cumulative plan matrix: planSlug → features included in that plan
  // A feature is included if its requiredPlan tier ≤ the plan tier
  // (k_start: 0, k_growth: 1, k_pro: 2, k_enterprise: 3)
  const planFeatures: Record<string, any[]> = {};
  const publicSlugs = ['k_start', 'k_growth', 'k_pro', 'k_enterprise'];

  for (const planSlug of publicSlugs) {
    const planTier = TIER_INDEX[planSlug] ?? 3;
    planFeatures[planSlug] = customerFeatures.filter((f: any) => {
      const required = f.requiredPlan ?? 'k_start';
      const reqTier = TIER_INDEX[required] ?? 0;
      return reqTier <= planTier;
    });
  }

  return (
    <MembershipsClient
      publicPlans={publicPlans}
      legacyPlans={legacyPlans}
      promotions={promotions}
      subscriberCounts={countMap}
      planFeatures={planFeatures}
    />
  );
}
