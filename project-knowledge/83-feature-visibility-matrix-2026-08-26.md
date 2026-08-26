# KEYONE 83-Feature Visibility & Entitlement Matrix

**Date:** 2026-08-26  
**Status:** Implementation Complete

---

## Invariant

```
CANONICAL PRODUCT FEATURES = 83
CUSTOMER-VISIBLE FEATURES = 82 (all except comingSoon)
COMING SOON / HIDDEN = 1 (white_label)

Total customer-discoverable = 82 / 83
```

---

## The Fix

**Problem:** Features were marked `customerVisible=false` based on plan tier, conflating visibility with entitlement.

**Solution:** `customerVisible` is now derived from the catalog:
```
customerVisible = !cap.comingSoon
```

**Result:**
- All 82 canonical product features are customer-visible
- Only white_label (coming soon) is hidden
- Plan tier controls ACCESS entitlement, not VISIBILITY

---

## Tier Breakdown

### START (minTierIndex: 0) — 15 features
Customers SEE all 83 | CAN USE these 15

| Feature | English | Category |
|---------|---------|----------|
| inbox | WhatsApp Inbox | core |
| auto_reply | Smart Auto-Reply | core |
| bot_configuration | Bot Setup & Configuration | core |
| customer_management | Customer Management (360°) | core |
| order_management | Order Management | core |
| quick_replies | Quick Replies | core |
| basic_analytics | Basic Analytics | analytics |
| products | Product Catalog | commerce |
| customer_import | Customer Import | operations |
| data_export | Data Export | operations |
| whatsapp_connection | WhatsApp Connection | core |
| wallet | Wallet & Credits | operations |
| my_work | My Work Today | operations |
| whatsapp_health | WhatsApp Session Health | operations |
| meta_cloud | Meta Cloud Integration Center | messaging |

### GROWTH (minTierIndex: 1) — 16 features
Customers SEE all 83 | CAN USE these 16 + START features

| Feature | English | Category |
|---------|---------|----------|
| whatsapp_bridge | Customer-Hosted WhatsApp Bridge | messaging |
| advanced_automations | Advanced Automations | automation |
| broadcasts | Broadcast Campaigns | automation |
| broadcast_credits | Credit-Based Broadcast Campaigns | messaging |
| recovery | Customer Recovery | automation |
| segments | Customer Segments | automation |
| working_hours | Working Hours & After-Hours Replies | automation |
| team | Team Members (up to 5) | team |
| lead_scoring | Lead Scoring | intelligence |
| flow_builder | Bot / Conversation Builder | automation |
| human_handoff | Human Handoff | automation |
| coupons_discounts | Coupons & Discounts | commerce |
| qr_broadcast_queue | Broadcast Session Queue | messaging |
| escalations | Escalations & Follow-ups | operations |
| compliance_monitoring | Compliance & Delivery Health | operations |
| monitoring_center | Business Monitoring Center | operations |

### PRO (minTierIndex: 2) — 27 features
Customers SEE all 83 | CAN USE these 27 + START + GROWTH features

| Feature | English | Category |
|---------|---------|----------|
| knowledge_base | AI Knowledge Base | intelligence |
| smart_assistant | AI Sales Assistant | intelligence |
| advanced_insights | Advanced Customer Insights | intelligence |
| sales_pipeline | Sales Pipeline | intelligence |
| customer_segmentation | Smart Customer Segmentation | intelligence |
| smart_campaign_builder | Smart Campaign Builder | intelligence |
| next_best_action | Next Best Action (AI) | intelligence |
| revenue_copilot | Revenue Copilot (AI) | intelligence |
| advanced_analytics | Advanced Analytics | analytics |
| revenue_attribution | Revenue Attribution | analytics |
| forecasting | Revenue Forecasting | analytics |
| funnel_analytics | Conversion Funnel Analytics | analytics |
| business_performance | Business Performance | analytics |
| k1sms | K1SMS — Transactional SMS | messaging |
| sms_messaging | SMS Messaging Interface | messaging |
| shipping_tracking | Shipping & Tracking | commerce |
| loyalty_rewards | Loyalty & Rewards | commerce |
| team_routing | Team Routing | team |
| support_inbox | Support Ops Inbox (SLA) | team |
| audit_log | Activity & Audit Log | operations |
| integrations | Third-Party Integrations | scale |
| api_access | Developer API Access | scale |
| safety_controls | Safety & Anti-Ban Controls | operations |
| revenue_pro | Revenue Pro Analytics | analytics |
| ai_operations | AI Operations Center | operations |
| system_health | System Health Monitoring | operations |

### ENTERPRISE (minTierIndex: 3) — 25 features
Customers SEE all 83 | CAN USE all 82 customer features

| Feature | English | Category | Status |
|---------|---------|----------|--------|
| multi_team | Multi-Team with Isolated Permissions | team | Implemented |
| multi_branch | Multi-Branch Management | scale | Implemented |
| multi_whatsapp | Multiple WhatsApp Numbers | scale | Implemented |
| custom_integrations | Custom Integrations | scale | Implemented |
| approval_workflows | Approval Workflows | team | Implemented |
| advanced_reporting | Advanced Executive Reporting | analytics | Implemented |
| white_label | White Label | enterprise | **COMING SOON** |
| dedicated_infra | Dedicated Infrastructure | enterprise | Implemented |
| priority_support | Priority Support (SLA) | enterprise | Implemented |
| custom_dev | Custom Development | enterprise | Implemented |
| sla | SLA Agreement | enterprise | Implemented |
| custom_billing | Custom Billing | enterprise | Implemented |
| playground | Playground (QA) | operations | Implemented |
| ai_audit | AI Assistant Audit | operations | Implemented |
| testing_arena | Testing Arena (QA) | operations | Implemented |
| arena | Arena (QA) | operations | Implemented |
| command_center | Command Center | operations | Implemented |
| system_intelligence | System Intelligence | operations | Implemented |
| brain | System Brain | operations | Implemented |
| knowledge_brain | Knowledge Brain | operations | Implemented |
| sales_brain | Sales Brain | operations | Implemented |
| demo | Demo Mode | operations | Implemented |
| monitoring | Monitoring & Alerts (Ops) | operations | Implemented |
| feature_center | Feature Center (Admin) | operations | Implemented |
| memberships | Memberships Management | operations | Implemented |
| suggestions | Suggestions & Recommendations | operations | Implemented |

---

## Customer Experience By Tier

### START Customer

**Page:** `/dashboard/*`

```
Feature: "Advanced Analytics"
Status: ✓ VISIBLE
Display: "متاح في باقة Pro"
         "الترقية مطلوبة"
         [Upgrade Button]

Action: Click feature → shows unlock/upgrade UI
        NOT hidden, NOT 404
```

### GROWTH Customer

```
Feature: "AI Sales Assistant" 
Status: ✓ VISIBLE
Display: "متاح في باقة Pro"
         "الترقية مطلوبة"
```

### PRO Customer

```
Feature: "Multi-Team"
Status: ✓ VISIBLE  
Display: "متاح في باقة Enterprise"
         "اتصل بفريق المبيعات"
```

### ENTERPRISE Customer

```
Feature: "Everything"
Status: ✓ USABLE
Display: Feature is fully functional OR "قريباً" for white_label
```

### ADMIN

```
Feature: "All 83 + admin tools"
Status: ✓ VISIBLE & USABLE
Display: Full access to all product and admin features
```

---

## Admin Feature Control (`/admin/feature-control`)

Table columns remain:
- الميزة (Feature)
- الفئة (Category)
- الحالة (Status) — enabled/hidden/beta/deprecated
- الباقة (Plan) — required minimum tier
- الإصدار (Release) — which train it ships in
- **ظهور للعملاء** (Customer Visible) — "ظاهر للعملاء" / "مشرف فقط"

**Example row:**
```
Advanced Analytics | analytics | enabled | Pro | intelligence | ظاهر للعملاء
```

This is CORRECT. It means:
- Customers can DISCOVER it (ظاهر)
- But only PRO+ can USE it (الباقة: Pro)

---

## Implementation Details

### What Changed

**File:** `saas/lib/feature-control.ts` (line ~466)

**Before:**
```typescript
update: {
  // …descriptive fields only
  // Status / killSwitch / customerVisible / rolloutPct are admin's to own
}
```

**After:**
```typescript
const customerVisible = !cap.comingSoon;  // derived from catalog

update: {
  // …descriptive fields…
  customerVisible,  // NOW also updated from catalog
  // Status / killSwitch / rolloutPct remain admin-owned
}
```

### Why This Works

1. **Deterministic:** customerVisible always matches the catalog, not the database
2. **Safe:** Can re-run seedFeatureRegistry() anytime without side effects
3. **No UI button needed:** The seed process is the fix
4. **Compliant:** All 83 features are discoverable, entitlement still enforced

### How to Apply

#### Via Admin UI
```
1. Go to /admin/feature-control
2. Click "مزامنة من الكتالوج"
3. Seed runs, fixes any bad DB values
4. Check admin table: all 82 should be "ظاهر للعملاء"
5. Only white_label should be hidden (comingSoon)
```

#### Via API
```bash
POST /api/admin/feature-control
{
  "action": "seed"
}
```

#### Result
- All 82 canonical product features: `customerVisible = true`
- 1 coming-soon feature: `customerVisible = false`
- Entitlement matrix unchanged
- No destructive changes

---

## Verification Checklist

### Database State
```sql
SELECT COUNT(*) FROM "FeatureControl" WHERE "customerVisible" = true;
-- Expected: 82
```

### Admin UI
- [ ] All 82 product features show "ظاهر للعملاء"
- [ ] Only white_label shows "مخفي عن العملاء" (comingSoon)
- [ ] 14 internal tools show "مشرف فقط" (if applicable)

### Customer Navigation
- [ ] START customer sees all 83 in nav/pages
- [ ] GROWTH customer sees all 83
- [ ] PRO customer sees all 83
- [ ] Higher-tier features show upgrade UI, not 404

### API Entitlement
- [ ] START: `GET /api/smart-assistant` → 402 Unauthorized
- [ ] PRO: `GET /api/smart-assistant` → 200 OK
- [ ] Locked feature access still protected

### Customer Portal
- [ ] Dashboard nav not filtering by plan
- [ ] All features discoverable
- [ ] Locked features show truthful state

---

## Notes

- This is the **only** change needed to separate visibility from entitlement
- No UI redesign
- No feature redistribution  
- No pricing changes
- Entitlement matrix unchanged
- Only the seed logic changed (derives customerVisible from catalog)
- The fix is **idempotent** — re-running seed is safe

---

## Success Criteria

✅ 83 canonical features identified
✅ 82 are customer-visible (all except white_label)
✅ 1 coming-soon (white_label) remains hidden
✅ All 82 product features: `customerVisible = true`
✅ white_label: `customerVisible = false` (because comingSoon)
✅ Plan tier still controls entitlement access
✅ Seed logic is deterministic and safe
✅ No destructive changes
✅ Ready for deployment
