# Membership System Restructure — Session Report
**Date:** 2026-08-17  
**Branch:** `claude/wkeyone-product-completion-4014f4`  
**Status:** Phase A–H complete. Phase I (DB cleanup) and Phase J (production deploy + proof) pending.

---

## What Was Done

### Phase A — Real Feature Inventory
Scanned all 92 dashboard pages to extract route, pageGate capability key, and auth pattern.

Result:
- **65 capabilities** now in catalog (`saas/lib/pricing/catalog.ts`)
- **7 capabilities** discovered in real codebase but missing from catalog — added
- **12 pages** had wrong or missing `pageGate()` calls — all fixed

### Phase B — Catalog Expansion (7 new capabilities)
Added to `saas/lib/pricing/catalog.ts`:

| Key | Tier | Category |
|-----|------|----------|
| `bot_configuration` | START | core |
| `broadcast_credits` | GROWTH | messaging |
| `compliance_monitoring` | GROWTH | operations |
| `meta_cloud` | GROWTH | messaging |
| `monitoring_center` | GROWTH | operations |
| `safety_controls` | PRO | operations |
| `revenue_pro` | PRO | analytics |

Added workspace/release overrides and dependency graph entries to `saas/lib/feature-control.ts`.

### Phase C — Gate Enforcement (12 pages fixed)
Pages with corrected gates:

| Page | Fix |
|------|-----|
| `/dashboard/coupons` | `smart_campaign_builder` → `coupons_discounts` (Growth not Pro) |
| `/dashboard/broadcasts-pro` | `broadcasts` → `broadcast_credits` |
| `/dashboard/escalations` | Missing gate added |
| `/dashboard/audit-log` | Missing gate added |
| `/dashboard/my-work` | Missing gate added |
| `/dashboard/bot` | Missing gate added |
| `/dashboard/compliance` | Missing gate added |
| `/dashboard/meta` | Missing gate added |
| `/dashboard/monitoring` | Missing gate added |
| `/dashboard/revenue-pro` | Missing gate added |
| `/dashboard/safety` | Missing gate added |
| `nav-items.tsx` | Duplicate `broadcasts-pro` entry removed; `coupons` nav gate corrected |

### Phase C — Admin Feature Center
`saas/app/admin/feature-control/page.tsx` expanded edit panel now includes:
- **Plan selector** (Start / Growth / Pro / Enterprise) — calls existing PATCH endpoint
- **Release selector** — assigns feature to a release train
- **Rollout % slider** — from 0–100%
- Plan badges color-coded by tier in collapsed row
- Rollout < 100% shown as amber warning
- Raw featureId moved out of the primary label (kept in table view for debugging)

### Phase D — Plan Assignment
The plan selector in the feature edit panel is wired through `PATCH /api/admin/feature-control/:id` which already accepts `requiredPlan`. No new API needed.

### Phase F — Membership Cleanup
- `PUBLIC_TIERS` was already defined in `catalog.ts` — only 4 tiers (Start/Growth/Pro/Enterprise)
- `k_business` and `k_scale` already have `public: false`
- Admin plans page correctly uses `TIERS` (full list, including legacy) for drift visibility

### Phase H — Pricing Page Fixes
Three bugs fixed in `saas/app/pricing/page.tsx`:
1. Used `TIERS` → switched to `PUBLIC_TIERS` so legacy plans never render
2. Capability matching used `tier.index` (0/1/2/5) instead of `tier.capIndex` (0/1/2/3) — Enterprise capabilities were silently missing from bullets
3. "Everything in X" previous-tier lookup used `TIERS[tier.index-1]` → now uses `PUBLIC_TIERS[publicIdx-1]`, so Enterprise correctly says "Everything in Pro" not "Everything in Scale"

Same fix applied to `saas/app/dashboard/billing/page.tsx`.

### Invariant Tests (+6 new)
`saas/__tests__/pricing-entitlement-agreement.test.ts` expanded to 16 tests:
- All `pageGate()` keys exist in catalog
- All `NAV_CAP_BY_HREF` values exist in catalog
- `pageGate()` keys are a subset of nav map (nav hides what pages enforce)
- Legacy plans absent from `PUBLIC_TIERS`

**Result: 151 tests across 8 files — all pass. TypeScript: 0 errors.**

---

## Commits (this session)
```
b32a3d8 feat(registry): expand catalog to 65 caps; enforce gates on 12 dashboard pages; harden invariant tests
d990e19 feat(admin): add plan/release/rollout editors to Feature Center; fix coupons nav gate
661a9f6 fix(pricing): use PUBLIC_TIERS and capIndex; stop showing legacy plans
f806476 fix(billing): use PUBLIC_TIERS so legacy plans don't appear in upgrade selector
```

---

## Remaining Work

### Phase I — Database Cleanup
**DO NOT DELETE anything without inventorying first.**
Steps:
1. `SELECT slug, status, "createdAt" FROM "Plan" ORDER BY "createdAt"` — classify ACTIVE/LEGACY/ORPHANED
2. `SELECT "featureId", status, "killSwitch" FROM "FeatureControl"` — any featureIds not in CAPABILITIES are orphaned
3. Only remove records where: slug matches a known-retired plan AND no active subscription references it
4. Verify with: `SELECT COUNT(*) FROM "Subscription" WHERE "planSlug" = 'k_business'`

### Phase J — Production Deploy + End-to-End Proof
Run before deploy:
```bash
npx tsc --noEmit --skipLibCheck
npm run build
npm run test
```

End-to-end checks (12 items from directive):
1. Kill switch disables feature for all users — test via Feature Center admin
2. Archived release blocks all features in that release
3. pricing/entitlement parity — 16 invariant tests must pass
4. Growth customer sees coupons, escalations, broadcasts in sidebar
5. Pro customer sees audit-log, safety-controls, revenue-pro
6. Start customer cannot access Growth pages (sees LockedFeature CTA)
7. Legacy subscriber (k_business) gets Pro capabilities — `capIndex: 2` verified
8. Pricing page shows only 4 plans (no k_business, no k_scale)
9. Billing upgrade selector shows only 4 plans
10. Enterprise feature bullets show Pro-tier delta (not empty)
11. Admin Feature Center sync button seeds all 65 capabilities
12. Plan assignment change in Feature Center is reflected in entitlement within 30s (cache TTL)
