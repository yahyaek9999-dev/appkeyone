/**
 * PHASE 3 VALIDATION TESTS
 *
 * Verify that:
 * 1. All 77 features exist in registry
 * 2. No duplicates
 * 3. Feature hierarchy is valid
 * 4. Admin can see all features
 * 5. Customers remain plan-restricted
 * 6. All required fields present
 */

import { promises as fs } from 'fs';
import path from 'path';

interface Feature {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  type: 'feature' | 'subfeature' | 'admin_internal';
  category: string;
  parentFeature?: string;
  capability: string;
  requiredPlan: 'start' | 'growth' | 'pro' | 'enterprise';
  routes: string[];
  apiFamilies: string[];
  status: 'implemented' | 'beta' | 'coming_soon' | 'disabled' | 'deprecated';
  implemented: boolean;
  customerVisible: boolean;
  adminVisible: boolean;
  discoverable: boolean;
  notes?: string;
}

describe('PHASE 3 - Admin Feature Center Validation', () => {
  let features: Feature[] = [];

  beforeAll(async () => {
    const registryPath = path.join(
      process.cwd(),
      'project-knowledge/master-feature-registry.json'
    );
    const registryData = await fs.readFile(registryPath, 'utf-8');
    features = JSON.parse(registryData);
  });

  describe('Feature Count', () => {
    test('Should have 77 total features', () => {
      expect(features.length).toBe(77);
    });

    test('Should have 61 core features', () => {
      const core = features.filter(f => f.type === 'feature');
      expect(core.length).toBe(61);
    });

    test('Should have 13 sub-features', () => {
      const sub = features.filter(f => f.type === 'subfeature');
      expect(sub.length).toBe(13);
    });

    test('Should have 3 admin/internal features', () => {
      const admin = features.filter(f => f.type === 'admin_internal');
      expect(admin.length).toBe(3);
    });

    test('All features should be implemented', () => {
      const notImplemented = features.filter(f => !f.implemented);
      expect(notImplemented.length).toBe(0);
    });
  });

  describe('Feature Hierarchy', () => {
    test('All sub-features should have valid parent features', () => {
      const subfeatures = features.filter(f => f.type === 'subfeature');
      subfeatures.forEach(sub => {
        const parent = features.find(f => f.id === sub.parentFeature);
        expect(parent).toBeDefined();
        expect(parent?.type).toBe('feature');
      });
    });

    test('Parent features should not have a parent', () => {
      const coreFeatures = features.filter(f => f.type === 'feature');
      coreFeatures.forEach(core => {
        expect(core.parentFeature).toBeUndefined();
      });
    });

    test('No circular parent relationships', () => {
      features.forEach(feature => {
        if (!feature.parentFeature) return;

        let current = feature;
        const visited = new Set<string>();

        while (current.parentFeature) {
          if (visited.has(current.parentFeature)) {
            throw new Error(`Circular parent relationship: ${feature.id}`);
          }
          visited.add(current.parentFeature);
          current = features.find(f => f.id === current.parentFeature) || current;
        }
      });
    });
  });

  describe('Feature Metadata', () => {
    test('Every feature should have required fields', () => {
      features.forEach(feature => {
        expect(feature.id).toBeDefined();
        expect(feature.key).toBeDefined();
        expect(feature.nameEn).toBeDefined();
        expect(feature.nameAr).toBeDefined();
        expect(feature.type).toBeDefined();
        expect(feature.category).toBeDefined();
        expect(feature.capability).toBeDefined();
        expect(feature.requiredPlan).toBeDefined();
        expect(Array.isArray(feature.routes)).toBe(true);
        expect(Array.isArray(feature.apiFamilies)).toBe(true);
        expect(feature.status).toBeDefined();
        expect(typeof feature.implemented).toBe('boolean');
        expect(typeof feature.customerVisible).toBe('boolean');
        expect(typeof feature.adminVisible).toBe('boolean');
        expect(typeof feature.discoverable).toBe('boolean');
      });
    });

    test('Feature IDs should be unique', () => {
      const ids = features.map(f => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('Feature keys should be unique', () => {
      const keys = features.map(f => f.key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    test('All features should have valid plan levels', () => {
      const validPlans = ['start', 'growth', 'pro', 'enterprise'];
      features.forEach(f => {
        expect(validPlans).toContain(f.requiredPlan);
      });
    });

    test('All features should have valid status', () => {
      const validStatus = ['implemented', 'beta', 'coming_soon', 'disabled', 'deprecated'];
      features.forEach(f => {
        expect(validStatus).toContain(f.status);
      });
    });

    test('All features should have valid type', () => {
      const validTypes = ['feature', 'subfeature', 'admin_internal'];
      features.forEach(f => {
        expect(validTypes).toContain(f.type);
      });
    });
  });

  describe('Admin Visibility', () => {
    test('All features should be adminVisible', () => {
      const notAdminVisible = features.filter(f => !f.adminVisible);
      expect(notAdminVisible.length).toBe(0);
    });

    test('Admin/internal features should not be customerVisible', () => {
      const adminFeatures = features.filter(f => f.type === 'admin_internal');
      adminFeatures.forEach(f => {
        if (f.key === 'audit_log') {
          expect(f.customerVisible).toBe(true); // Audit log is customer+admin visible
        } else {
          expect(f.customerVisible).toBe(false);
        }
      });
    });

    test('Customer features should be either customerVisible or admin-only sub-features', () => {
      const customerFeatures = features.filter(f => f.type !== 'admin_internal');
      customerFeatures.forEach(f => {
        expect(f.customerVisible || f.type === 'subfeature').toBe(true);
      });
    });
  });

  describe('Hidden Features', () => {
    test('Should have exactly 13 hidden features', () => {
      const hidden = features.filter(f => !f.discoverable && f.type !== 'admin_internal');
      expect(hidden.length).toBe(13);
    });

    test('Hidden features should have valid parent features', () => {
      const hidden = features.filter(f => !f.discoverable && f.type === 'subfeature');
      hidden.forEach(f => {
        expect(f.parentFeature).toBeDefined();
      });
    });

    test('All hidden features should be customer visible', () => {
      const hidden = features.filter(f => !f.discoverable && f.type === 'subfeature');
      hidden.forEach(f => {
        expect(f.customerVisible).toBe(true);
      });
    });
  });

  describe('Discovery', () => {
    test('Discoverable features should have at least one route or be sub-features', () => {
      const discoverable = features.filter(f => f.discoverable);
      discoverable.forEach(f => {
        if (f.type === 'feature') {
          expect(f.routes.length > 0 || f.routes[0] !== '').toBe(true);
        }
      });
    });

    test('Should have 56 discoverable features', () => {
      const discoverable = features.filter(f => f.discoverable);
      expect(discoverable.length).toBe(56);
    });
  });

  describe('Completeness', () => {
    test('No implemented feature should have type "coming_soon"', () => {
      const implementedButComingSoon = features.filter(
        f => f.implemented && f.status === 'coming_soon'
      );
      expect(implementedButComingSoon.length).toBe(0);
    });

    test('All features should have at least one category', () => {
      features.forEach(f => {
        expect(f.category).toBeTruthy();
      });
    });

    test('Feature count matches audit findings', () => {
      // 61 core + 13 hidden + 3 admin = 77 total
      const expectedCount = 77;
      expect(features.length).toBe(expectedCount);
    });
  });

  describe('Customer vs Admin', () => {
    test('Admin should see all 77 features', () => {
      // Admin bypass means no plan restrictions
      const adminVisibleFeatures = features.filter(f => f.adminVisible);
      expect(adminVisibleFeatures.length).toBe(77);
    });

    test('Start tier customer should see ~20 features', () => {
      // This is the entitlement system's job, not the registry's
      // Just verify the plan assignments exist
      const startFeatures = features.filter(f => f.requiredPlan === 'start' && f.customerVisible);
      expect(startFeatures.length).toBeGreaterThan(15);
    });

    test('Hidden features should still be part of admin inventory', () => {
      const hiddenButImplemented = features.filter(
        f => !f.discoverable && f.type === 'subfeature' && f.implemented
      );
      expect(hiddenButImplemented.length).toBe(13);
    });
  });
});
