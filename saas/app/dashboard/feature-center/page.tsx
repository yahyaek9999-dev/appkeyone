import { promises as fs } from 'fs';
import path from 'path';
import { getAuthContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import FeatureCenterClient from './FeatureCenterClient';

export const metadata = { title: 'Feature Center | KEYONE Admin' };
export const dynamic = 'force-dynamic';

interface RegistryFeature {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  type: 'feature' | 'subfeature' | 'admin_internal';
  category: string;
  parentFeature?: string;
  capability?: string;
  routes?: string[];
  apiFamilies?: string[];
  customerVisible?: boolean;
  requiredPlan?: string | null;
}

export default async function FeatureCenterPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isOwner && (ctx.user as any).role === 'admin';
  if (!isAdmin) redirect('/dashboard');

  // Load all 142 DB rows
  const dbControls = await (prisma as any).featureControl.findMany({
    orderBy: [{ featureSource: 'asc' }, { featureId: 'asc' }],
  });

  // Load canonical registry
  const registryPath = path.join(process.cwd(), '../project-knowledge/master-feature-registry.json');
  let registry: RegistryFeature[] = [];
  try {
    const data = await fs.readFile(registryPath, 'utf-8');
    registry = JSON.parse(data);
  } catch { registry = []; }

  const registryMap = new Map<string, RegistryFeature>();
  for (const f of registry) registryMap.set(f.key, f);

  // Build the control map (keyed by featureId)
  const ctrlMap = new Map<string, any>();
  for (const row of dbControls) {
    let deps: string[] = [];
    try { deps = JSON.parse(row.dependencies || '[]'); } catch {}
    ctrlMap.set(row.featureId, { ...row, dependencies: deps });
  }

  // Merge: every DB row is in the inventory; registry data enriches it
  const merged = dbControls.map((row: any) => {
    let deps: string[] = [];
    try { deps = JSON.parse(row.dependencies || '[]'); } catch {}
    const reg = registryMap.get(row.featureId);
    return {
      featureId:      row.featureId,
      name:           row.name,
      nameEn:         reg?.nameEn ?? row.description ?? row.featureId,
      nameAr:         row.name,
      type:           row.featureType ?? (reg?.type ?? 'feature'),
      category:       reg?.category ?? row.category ?? row.workspace ?? 'general',
      parentFeature:  reg?.parentFeature ?? null,
      capability:     reg?.capability ?? null,
      routes:         reg?.routes ?? [],
      apiFamilies:    reg?.apiFamilies ?? [],
      featureSource:  row.featureSource ?? 'legacy_db',
      featureType:    row.featureType ?? 'feature',
      adminVisible:   row.adminVisible ?? true,
      ctrl: {
        ...row,
        dependencies: deps,
        featureSource: row.featureSource ?? 'legacy_db',
        featureType:   row.featureType ?? 'feature',
        adminVisible:  row.adminVisible ?? true,
      },
    };
  });

  // Stats — derived from the 142 DB rows (authoritative)
  const m = merged as any[];
  const registryBacked = m.filter((f: any) => f.featureSource === 'registry');
  const legacyRows     = m.filter((f: any) => f.featureSource === 'legacy_db');

  const stats = {
    total:           m.length,
    registryBacked:  registryBacked.length,
    legacyTotal:     legacyRows.length,
    legacyMapped:    legacyRows.filter((f: any) => f.featureType === 'legacy_mapped').length,
    legacyUnmapped:  legacyRows.filter((f: any) => f.featureType === 'legacy_unmapped').length,
    // Registry classification
    customerFeatures: registryBacked.filter((f: any) => f.featureType === 'feature').length,
    subFeatures:      registryBacked.filter((f: any) => f.featureType === 'subfeature').length,
    adminFeatures:    registryBacked.filter((f: any) => f.featureType === 'admin_internal').length,
    // Runtime state
    active:          m.filter((f: any) => f.ctrl.status === 'enabled').length,
    disabled:        m.filter((f: any) => f.ctrl.status === 'disabled').length,
    hidden:          m.filter((f: any) => f.ctrl.status === 'hidden').length,
    beta:            m.filter((f: any) => f.ctrl.status === 'beta').length,
    killed:          m.filter((f: any) => f.ctrl.killSwitch).length,
    // Visibility
    customerVisible: m.filter((f: any) => f.ctrl.customerVisible && !f.ctrl.adminOnly && !f.ctrl.killSwitch).length,
    adminOnly:       m.filter((f: any) => f.ctrl.adminOnly || !f.ctrl.customerVisible).length,
  };

  return <FeatureCenterClient features={merged} stats={stats} />;
}
