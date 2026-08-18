/**
 * GET /api/admin/features
 *
 * Returns the complete feature registry for admin.
 * Admin users can see ALL features regardless of plan or status.
 */

import { requireUser, getAuthContext } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const authContext = await getAuthContext();

    if (!authContext?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Load feature registry
    const registryPath = path.join(
      process.cwd(),
      'project-knowledge/master-feature-registry.json'
    );

    const registryData = await fs.readFile(registryPath, 'utf-8');
    const features = JSON.parse(registryData);

    // Return all features to admin
    return new Response(JSON.stringify({
      success: true,
      count: features.length,
      features,
      summary: {
        total: features.length,
        coreFeatures: features.filter((f: any) => f.type === 'feature').length,
        subfeatures: features.filter((f: any) => f.type === 'subfeature').length,
        adminInternal: features.filter((f: any) => f.type === 'admin_internal').length,
        implemented: features.filter((f: any) => f.implemented).length,
        discoverable: features.filter((f: any) => f.discoverable).length,
        hidden: features.filter((f: any) => !f.discoverable && f.type !== 'admin_internal').length,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error loading features:', error);
    return new Response(JSON.stringify({ error: 'Failed to load features' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
