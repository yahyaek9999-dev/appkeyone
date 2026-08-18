import { promises as fs } from 'fs';
import path from 'path';
import { getAuthContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import FeatureCenterClient from './FeatureCenterClient';

interface RegistryFeature {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  type: 'feature' | 'subfeature' | 'admin_internal';
  category: string;
  parentFeature?: string;
  capability: string;
  routes: string[];
  apiFamilies: string[];
  customerVisible?: boolean;
  requiredPlan?: string | null;
  notes?: string;
}

export const metadata = {
  title: 'Feature Center | KEYONE Admin',
};

export default async function FeatureCenterPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect('/login');

  const isAdmin = ctx.isOwner && (ctx.user as any).role === 'admin';
  if (!isAdmin) redirect('/dashboard');

  const registryPath = path.join(
    process.cwd(),
    '../project-knowledge/master-feature-registry.json'
  );

  let registry: RegistryFeature[] = [];
  try {
    const data = await fs.readFile(registryPath, 'utf-8');
    registry = JSON.parse(data);
  } catch {
    registry = [];
  }

  // Load DB controls
  const dbControls = await (prisma as any).featureControl.findMany();
  const ctrlMap = new Map<string, any>();
  for (const row of dbControls) {
    let deps: string[] = [];
    try { deps = JSON.parse(row.dependencies || '[]'); } catch {}
    ctrlMap.set(row.featureId, { ...row, dependencies: deps });
  }

  // Merge: registry is source of truth for static fields; DB provides runtime controls
  const defaultCtrl = (key: string, f: RegistryFeature) => ({
    featureId: key,
    status: 'enabled',
    customerVisible: f.type !== 'admin_internal' ? (f.customerVisible ?? true) : false,
    adminOnly: f.type === 'admin_internal',
    beta: false,
    killSwitch: false,
    rolloutPct: 100,
    requiredPlan: f.requiredPlan ?? null,
    releaseId: null,
    dependencies: [],
  });

  const merged = registry.map(f => {
    const ctrl = ctrlMap.get(f.key) ?? defaultCtrl(f.key, f);
    return { ...f, ctrl };
  });

  // Classification stats (from registry — not DB-derived so they're stable)
  const stats = {
    // Registry structure
    customerFeatures:  registry.filter(f => f.type === 'feature').length,
    subFeatures:       registry.filter(f => f.type === 'subfeature').length,
    adminFeatures:     registry.filter(f => f.type === 'admin_internal').length,
    totalRegistry:     registry.length,
    // DB persistence
    persistedControls: dbControls.length,
    // Runtime state (from merged)
    active:            merged.filter(f => f.ctrl.status === 'enabled').length,
    disabled:          merged.filter(f => f.ctrl.status === 'disabled').length,
    hidden:            merged.filter(f => f.ctrl.status === 'hidden').length,
    beta:              merged.filter(f => f.ctrl.status === 'beta').length,
    killed:            merged.filter(f => f.ctrl.killSwitch).length,
    customerVisible:   merged.filter(f => f.ctrl.customerVisible).length,
  };

  return <FeatureCenterClient features={merged} stats={stats} />;
}
