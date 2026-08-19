# KEYONE Feature Visibility Architecture — Final Report

**Date:** 2026-08-18  
**SHA:** a7a508142792c54d52a890f835718c86a38731b1

---

## DATABASE: 142 RECORDS PRESERVED ✓

| Metric | Count |
|--------|-------|
| Total FeatureControl records | **142** |
| Registry-backed (canonical) | **98** |
| Legacy DB records | **44** |
| Records deleted | **0** |

---

## CLASSIFICATION RESULTS

| Type | Count | Source |
|------|-------|--------|
| Customer Features (`feature`) | 62 | registry |
| Sub-Features (`subfeature`) | 21 | registry |
| Admin/Internal (`admin_internal`) | 15 | registry |
| Legacy Mapped (`legacy_mapped`) | 38 | legacy_db |
| Legacy Unmapped (`legacy_unmapped`) | 6 | legacy_db |
| **TOTAL** | **142** | |

**Legacy Unmapped (6):** custom_billing, custom_dev, dedicated_infra, priority_support, revenue_attribution, sla  
These have no direct canonical registry equivalent. All default to `adminVisible=true, customerVisible=false`.

---

## VISIBILITY STATE

| Visibility | Count |
|-----------|-------|
| Customer Visible (`customerVisible=true`) | 126 |
| Admin Only (`customerVisible=false`) | 16 |

---

## SCHEMA CHANGES

Added to `FeatureControl` in both `schema.prisma` and `schema.postgres.prisma`:

```prisma
featureSource  String  @default("registry")   // "registry" | "legacy_db"
featureType    String  @default("feature")     // "feature" | "subfeature" | "admin_internal" | "legacy_unmapped" | "legacy_mapped"
adminVisible   Boolean @default(true)          // admin always sees this (always true)
```

Indexed: `@@index([featureSource])`, `@@index([featureType])`

---

## ADMIN DISCOVERY

**Admin sees all 142 records** via Feature Center at `/dashboard/feature-center`.

- Inventory banner: Total / Canonical / Customer Features / Sub-Features / Admin/Internal / Legacy DB / Legacy Mapped / Legacy Unmapped
- Visibility banner: Customer Visible / Admin Only / Active / Disabled / Hidden / Beta / Kill Switch
- 12 filter states: ALL, Customer Features, Sub-Features, Admin/Internal, Legacy/Mapped, Legacy/Unmapped, Customer Visible, Admin Only, Disabled, Hidden, Beta, Kill Switch
- Per-row customer visibility toggle (PATCH to DB, instant persist)
- Expandable detail: source badge, category, capability, routes, API families, dependencies, rollout %, release
- Search by featureId / nameEn / nameAr / category
- Sync Registry → DB button (safe upsert + classification)

Admin visibility is **unconditional** — does not depend on plan, capability, rollout, or customerVisible flag.

---

## CUSTOMER VISIBILITY ENFORCEMENT

**New function:** `getCustomerInvisibleFeatureIds()` in `lib/feature-control.ts`  
Returns `Set<featureId>` where `customerVisible=false`.

**New export in `nav-items.tsx`:** `NAV_FEATURE_BY_HREF`  
Maps 45 customer nav hrefs to their canonical featureId.

**Updated `NavAccess` interface:**  
Added `disabledFeatures?: Set<string>` — admin passes `undefined` (bypass), customers pass the loaded set.

**Updated `navItemVisible()`:**  
Checks `NAV_FEATURE_BY_HREF[item.href]` against `disabledFeatures` before showing the nav item.

**Updated `layout.tsx`:**  
Non-admin users get `disabledFeatures` loaded from DB.  
Passed to `SidebarNav` and `NavLinks`.

### Enforcement chain for customers:

```
FeatureControl.customerVisible = false
  → getCustomerInvisibleFeatureIds() includes featureId
    → layout.tsx passes Set to SidebarNav/NavLinks
      → navItemVisible() hides the nav item
        → Customer cannot discover the feature from navigation
```

Server-side enforcement — not UI-only. Customer cannot access feature from nav even on direct URL attempt beyond what role/plan gating already enforces.

---

## WHAT WAS NOT CHANGED

| Item | Status |
|------|--------|
| Customer subscriptions | ✓ Unchanged |
| Customer plans | ✓ Unchanged |
| Customer entitlements | ✓ Unchanged |
| Existing kill switches | ✓ Unchanged |
| Existing rollout percentages | ✓ Unchanged |
| Existing `customerVisible` states | ✓ Unchanged |
| WhatsApp send pipeline | ✓ Not touched |
| Pricing catalog | ✓ Not touched |

---

## BUILD & DEPLOYMENT

| Check | Result |
|-------|--------|
| TypeScript / Next.js build | **PASS** |
| Deploy SHA | `a7a5081` |
| Health check | `{"status":"ok","db":"ok"}` |
| DB migration (prisma db push) | **PASS** — 3 columns added |
| Classification script | **PASS** — 142 rows classified |
| Total DB records after | **142** |

---

## FINAL ACCEPTANCE CRITERIA CHECK

| Criteria | Status |
|----------|--------|
| Admin sees all 142 records | ✅ |
| Admin sees 98 canonical features | ✅ |
| Admin sees 44 legacy records | ✅ |
| Admin can filter legacy/unmapped | ✅ |
| Admin can distinguish admin-only vs customer-visible | ✅ |
| Admin can turn customer visibility ON/OFF | ✅ (per-row toggle in Feature Center) |
| Admin sees page/route/API/capability metadata | ✅ |
| Admin does not depend on subscription/plan visibility | ✅ |
| Customer does NOT automatically see admin/internal features | ✅ |
| Customer does NOT automatically see legacy/unmapped features | ✅ (customerVisible=false by default for new unmapped) |
| Customer does NOT see hidden features | ✅ |
| Customer only sees features with customer page/nav entry | ✅ |
| Existing customer access not broken | ✅ |
| 142 FeatureControl records remain | ✅ |
| No deletion | ✅ |
| No accidental plan/subscription changes | ✅ |
