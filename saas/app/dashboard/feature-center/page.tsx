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

  // Merge: registry is source of truth for static fields; DB is source for runtime controls
  const merged = registry.map(f => {
    const ctrl = ctrlMap.get(f.key) ?? {
      featureId: f.key,
      status: 'enabled',
      customerVisible: true,
      adminOnly: false,
      beta: false,
      killSwitch: false,
      rolloutPct: 100,
      requiredPlan: null,
      releaseId: null,
      dependencies: [],
    };
    return { ...f, ctrl };
  });

  return <FeatureCenterClient features={merged} />;
}
