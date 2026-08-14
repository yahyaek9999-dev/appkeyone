# WKEYONE — Final Membership Matrix
**Generated:** 2026-08-14

## Public Tier Structure

| Tier | Slug | capIndex | Price Model | WhatsApp Numbers | AI/mo | Messages/mo | Team |
|------|------|----------|------------|-----------------|-------|-------------|------|
| Start | k_start | 0 | Monthly | 1 | Limited | 3,000 | 1 |
| Growth | k_growth | 1 | Monthly | 2 | Standard | 10,000 | 5 |
| Pro | k_pro | 2 | Monthly | 3+ | Advanced | 30,000 | 20 |
| Enterprise | k_enterprise | 3 | Custom | Unlimited | Unlimited | Unlimited | Unlimited |

Legacy slugs (backward compat, NOT in PUBLIC_TIERS): `k_business`, `k_scale`

---

## Entitlement Layer Stack

Every feature access resolves through `getEntitlements(userId)` in 5 layers:

```
Layer 1: Base Plan (capIndex from catalog)
  ↓ ADDITIVE
Layer 2: CustomerPlanOverride (admin custom deal)
  ↓ ADDITIVE
Layer 3: PromotionRedemption (active feature unlocks)
  → fetchActivePromoUnlocks() — redeemed promos + auto-apply global promos
  ↓ ADDITIVE
Layer 4: EntitlementGift (one-time credits, feature unlocks, plan upgrades)
  → fetchActiveGifts() — non-expired, non-used gifts
  ↓ OVERRIDE (kill switch wins over everything)
Layer 5: FeatureControl kill switch
  → getAllFeatures() [30s cached] → if killSwitch=true → capabilities[key]=false
```

**Fail-open guarantee:** Every layer wraps in try/catch. A DB error in any layer returns the result WITHOUT that layer (never throws to the user).

---

## Capability Keys (from pricing/catalog.ts)

| Key | Min Tier | Description |
|-----|----------|-------------|
| multi_whatsapp | Growth (1) | Multiple WhatsApp numbers |
| broadcasts | Start (0) | Broadcast messages |
| advanced_analytics | Pro (2) | Advanced analytics dashboards |
| knowledge_base | Growth (1) | Knowledge base documents |
| smart_assistant | Pro (2) | AI knowledge brain |
| sales_pipeline | Pro (2) | Sales pipeline tracking |
| revenue_attribution | Pro (2) | Revenue attribution |
| advanced_insights | Pro (2) | Advanced business insights |
| customer_segmentation | Growth (1) | Customer segments |
| smart_campaign_builder | Pro (2) | Smart campaigns |
| advanced_reporting | Pro (2) | Business performance reports |
| advanced_automations | Growth (1) | Automation builder |
| multi_branch | Enterprise (3) | Multi-branch management |
| approval_workflows | Pro (2) | Approval workflow system |
| api_access | Growth (1) | API & webhook access |
| working_hours | Start (0) | Working hours schedule |
| lead_scoring | Growth (1) | Lead scoring AI |

---

## Plan Limits

| Limit Key | Description | Admin Can Override |
|-----------|-------------|-------------------|
| team | Max team members | ✅ via limitOverrides |
| automations | Max automation rules | ✅ |
| kbDocs | Max knowledge base docs | ✅ |
| whatsapp | Max WhatsApp number slots | ✅ |
| broadcasts | Max broadcasts/month | ✅ |
| ai | Max AI requests/month | ✅ |
| messages | Max messages/month | ✅ |
| customers | Max customers in CRM | ✅ |
| smsCredits | SMS credit pool | Via EntitlementGift/Promotion |

**0 = unlimited in all limit keys.**

---

## Promotion Types

| Type | Effect on Entitlements |
|------|----------------------|
| discount | Price reduction only (no cap change) |
| free_trial | Sets trial period + status="trial" |
| feature_unlock | capabilities[featureKey]=true via Layer 3 |
| credit_bonus | limits.smsCredits / ai / broadcasts += creditAmount via Layer 3 |
| gift | Explicit EntitlementGift row → Layer 4 |
| bulk | Volume discount for B2B (no cap change) |

---

## Enforcement Modes

| Mode | When Active | What It Enforces |
|------|-------------|-----------------|
| `enforce=true` | k_* plan slugs | Plan capability gating in nav + hasCapability() |
| `enforce=true` | isFallback + FREE_TIER_ENFORCEMENT=1 | Free tier gating |
| `enforce=false` | Legacy active subscribers | Full access (non-regressive) |
| `blocked=true` | Subscription.suspended=true | All features return false |

---

## Subscription Lifecycle

```
Signup → User created (role="user")
  → plan="k_start" (default free tier)
  → isActiveSubscription() checks: status="active"/"trial" + !suspended

  Admin assigns plan → Plan.id in Subscription
  Trial started → status="trial", trialStartsAt/trialEndsAt set
  Payment received → status="active"
  Payment failed → status="expired"
  Admin suspend → User.suspended=true
  Admin delete → User.deletedAt=<date> (soft delete only)
```

---

## Impact of Each Layer on a Sample User (k_start plan)

Scenario: Customer on k_start who needs `multi_whatsapp` capability.

| Layer | Action | Result |
|-------|--------|--------|
| Layer 1 | k_start capIndex=0, multi_whatsapp needs capIndex≥1 | capabilities.multi_whatsapp = **false** |
| Layer 2 | No override | unchanged |
| Layer 3 | Admin created a "Promo: feature_unlock multi_whatsapp" and user redeemed | capabilities.multi_whatsapp = **true** |
| Layer 4 | No gift | unchanged |
| Layer 5 | Admin hasn't killed multi_whatsapp feature | unchanged |
| Result | | **true** — user gets the feature despite k_start plan |
