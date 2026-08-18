# Database Audit Report — 2026-08-18

## Summary

Database is clean. No destructive cleanup required.

---

## Findings

### SAFE TO KEEP (no action needed)

| Item | Count | Detail |
|------|-------|--------|
| Active subscriptions | 5 | All valid, long-lived expiry |
| Active plans | 5 | k_start, k_growth, k_pro, k_enterprise, k_admin |
| FeatureControl rows | 68 | All seeded, status=enabled, killSwitch=false |
| Customers | 2,462 | Normal |

### ARCHIVED (by design — no action needed)

| Item | Count | Detail |
|------|-------|--------|
| Archived plans | 2 | k_business, k_scale — both have 0 active subscribers |
| k_scale subscribers | 2 | `nkhf748@gmail.com` (exp 2027), `yahyaemad999@gmail.com` (exp 2028) — still active on archived plan, correct behavior |

> **Note**: When a plan is archived, existing subscribers keep entitlements (enforced by planId, not plan status). These 2 users have paid subscriptions; do NOT migrate or cancel without their approval.

### REQUIRES ADMIN REVIEW (not auto-cleaned)

| Item | Count | Detail |
|------|-------|--------|
| Open incidents | 44 | All "WhatsApp send failed", medium severity, 2026-07-31 to 2026-08-08 |

> These are real incident records from failed WhatsApp sends. Review and close via `/admin/incidents` or auto-close if older than 30 days is acceptable business policy. Not safe to bulk-delete without confirming none are under investigation.

### VERIFIED CLEAN

- Expired subscriptions (>90 days old): **0**
- Stale pending subscriptions (>30 days): **0**
- Expired promotions: **0**
- Expired entitlement gifts: **0**
- Deprecated features: **0**
- Archived releases: **0**
- Orphaned plan overrides: **0**
- Promotion redemptions: **0**

---

## Recommendations

1. **Incidents**: If WhatsApp send failures older than 30 days have no ongoing investigation, consider an auto-close rule in `/admin/incidents`. Do not bulk-delete without policy decision.

2. **k_scale subscribers**: Two users (nkhf748, yahyaemad999) are on k_scale which is archived. Their entitlements continue to work correctly. When their subscriptions expire (2027-2028), they will need to migrate to an active plan. No immediate action needed.

3. **k_admin plan**: 3 admin accounts use this plan (yahyaemad, yefk.wk1, yahyaemad998). This is correct — k_admin is an internal administrative plan.

---

## No Destructive Operations Performed

This audit was read-only. All counts verified via psql against production DB.
