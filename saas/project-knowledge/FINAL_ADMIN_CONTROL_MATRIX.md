# WKEYONE — Final Admin Control Matrix
**Generated:** 2026-08-14

## Admin Access Tiers

| Principal | Cookie | What they can access |
|-----------|--------|---------------------|
| Owner (User.role="admin") | mse_session | Full admin panel |
| Staff member (StaffMember.active=true) | mse_staff_session | Full admin panel (Path B) |
| Owner (User.role="user") | mse_session | /dashboard only, redirected from /admin |
| Team member of owner | mse_session | /dashboard only (member, not owner) |

---

## Admin Control Surface

### Finances
| Route | Controls | Admin-Only |
|-------|----------|-----------|
| /admin/plans | Plan pricing, limits per tier | ✅ |
| /admin/commercial | Per-customer plan overrides, entitlement gifts | ✅ |
| /admin/promotions | 6 promotion types: discount/trial/feature_unlock/credit/gift/bulk | ✅ |
| /admin/billing | Platform billing dashboard | ✅ |
| /admin/payment-gateways | Tap/MyFatoorah/COD/Manual config, encrypted | ✅ |
| /admin/wallet | Platform wallet ops | ✅ |
| /admin/revenue | Revenue analytics | ✅ |
| /admin/invoices | Invoice management | ✅ |

### Feature Control
| Route | Controls | Kill Switch Effect |
|-------|----------|------------------|
| /admin/feature-control | featureId → status/killSwitch/dependencies | killSwitch=true → capabilities[featureId]=false in getEntitlements() Step 5 |
| /admin/releases | Release lifecycle: hidden/beta/active/archived | |

**Kill switch chain:** Admin sets killSwitch=true → `getAllFeatures()` (30s cache) → `getEntitlements()` Step 5 → `capabilities[key] = false` → `hasCapability()` returns false → API returns 402/403 → UI shows upgrade CTA.

**What the kill switch DOES affect:**
- Plan capabilities (any capKey registered in CAPABILITIES catalog)
- Navigation visibility (when enforce=true and cap is in NAV_CAP_BY_HREF)
- Feature-gated API routes that call `isFeatureEnabled()` directly

**What the kill switch does NOT affect:**
- Routes that don't call hasCapability/isFeatureEnabled (most legacy routes)
- Admin staff access (independent cookie path)

### User Management
| Route | Controls |
|-------|----------|
| /admin/users | Customer subscription status, plan assignment |
| /admin/staff | Staff members: create/invite/suspend/delete |
| /admin/teams | Team overview |

### Operational Controls
| Route | Controls |
|-------|----------|
| /admin/system-health | Bridge health, queue status, DB status |
| /admin/usage-stats | Platform-wide usage from UsageLedger |
| /admin/audit-log | All admin actions (audited via AuditLog model) |
| /admin/support | Customer support tickets |

---

## Feature Control → Admin Capability Matrix

An Admin can independently control each of these without a code deploy:

| What | How | Scope |
|------|-----|-------|
| Enable/disable any feature | /admin/feature-control → killSwitch | Platform-wide |
| Override a customer's plan | /admin/commercial → CustomerPlanOverride | Per-customer |
| Grant a feature to a customer | /admin/commercial → EntitlementGift (type=feature_unlock) | Per-customer |
| Unlock feature via promotion | /admin/promotions → type=feature_unlock | Global or per-user |
| Adjust number limits | /admin/plans → limitOverrides | Per-plan |
| Release a feature to beta users | /admin/releases → status=beta | Platform-wide |
| Suspend a customer | /admin/users → suspended=true | Per-customer |
| Create staff account | /admin/staff → invite → /admin/invite/[token] | Staff |
| Disable a payment gateway | /admin/payment-gateways → active=false | Platform-wide |

---

## Security Controls (Admin Must Not Be Able to Bypass)

| Control | Enforcer | Bypassable? |
|---------|----------|------------|
| WhatsApp send pipeline | NEVER touch without approval | N/A |
| OTP raw value storage | SHA-256 only — code enforces | No |
| Team member data isolation | server-side assignedStaffId filter | No |
| Number-level employee access | server-side allowedNumberIds filter | No |
| Usage quota enforcement | server-side checkAndCharge() | No |
| Admin layout requires valid session | redirect() if no valid cookie | No |

---

## SUPER_ADMIN vs Admin

Currently, all `User.role === "admin"` users have equal platform access. SUPER_ADMIN role is implemented for StaffMembers (role="super_admin") but not yet differentiated in permission checks. This is a future hardening item — not a current gap.
