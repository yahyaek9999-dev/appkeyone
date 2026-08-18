// POST /api/admin/feature-control/sync
// Reads master-feature-registry.json and upserts missing FeatureControl rows.
// Safe: never overwrites admin-controlled fields on existing rows.
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { requireAdmin } from '@/lib/admin';
import { syncRegistryFromJson } from '@/lib/feature-control';

export const dynamic = 'force-dynamic';

export async function POST() {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: 'غير مصرح' }, { status: 401 }); }

  const registryPath = path.join(process.cwd(), '../project-knowledge/master-feature-registry.json');

  let registry: any[];
  try {
    const raw = await fs.readFile(registryPath, 'utf-8');
    registry = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'registry_not_found', path: registryPath }, { status: 500 });
  }

  const result = await syncRegistryFromJson(registry);
  return NextResponse.json({ ok: true, ...result, total: registry.length });
}
