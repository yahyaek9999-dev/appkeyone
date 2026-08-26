# Phase 1 — Authoritative 83-Feature Visibility Audit

**Date:** 2026-08-26
**Production host:** `ubuntu@16.171.230.84` (`w.keyone1.com`)
**Production DEPLOYED_COMMIT at audit time:** `61914eca06f6079238166838da758a2da4ce52ab`
**Local HEAD at audit time:** `65f3ef046ac170885fbedfe5fd8e5ce30abeb181` (5 commits ahead — NOT deployed)
**Data source:** live `psql -d keyone` on production + static analysis of `saas/`

> Nothing was modified to produce this document. Every value below is read from
> the production database or from source, not inferred from names.

---

## 1. Headline counts (measured, not assumed)

| Invariant | Required | Measured |
|---|---|---|
| Catalog capabilities (`CAPABILITIES` in `lib/pricing/catalog.ts`) | 83 | **83** ✅ |
| `FeatureControl` rows in production | 83 | **83** ✅ |
| Catalog-only (in catalog, missing from DB) | 0 | **0** ✅ |
| DB-only (in DB, missing from catalog) | 0 | **0** ✅ |
| `customerVisible = true` | 83 | **65** ❌ |
| `customerVisible = false` | 0 | **18** ❌ |
| `adminOnly = true` | 0 | **0** ✅ |
| `killSwitch = true` | 0 | **0** ✅ |
| `status` distribution | — | 82 `enabled`, 1 `hidden` (`white_label`) |

Catalog tier distribution (drives ENTITLEMENT, not visibility):
`minTierIndex 0 = 15`, `1 = 16`, `2 = 27`, `3 = 25`
→ cumulative entitlement counts **START 15 / GROWTH 31 / PRO 58 / ENTERPRISE 83** — matches the stated target.

---

## 2. The 18 rows with `customerVisible = false`

```
arena                 brain                 command_center        customer_segmentation
demo                  feature_center        knowledge_brain       loyalty_rewards
memberships           monitoring            multi_team            playground
qr_broadcast_queue    sales_brain           suggestions           system_intelligence
testing_arena         white_label
```

All 18 exist in the canonical catalog. All 18 must become `true`.

**Material finding:** of these 18, only **`white_label`** currently has a
destination in the *customer* navigation. The other 17 have no customer nav
entry at all — their hrefs live exclusively in `ADMIN_WORKSPACE`
(`app/dashboard/nav-items.tsx:287`), which is appended only when
`isPlatformAdmin === true`. So for 17 of the 18, flipping `customerVisible`
changes nothing that a customer can see; the nav gate that actually hides them
is workspace membership, not the visibility flag.

---

## 3. Complete 83-row matrix

Legend — `rendered to customers` = `customerVisible === true` **and** the feature
has at least one href inside a customer workspace. `locked correctly` = the
destination is covered by `pageGate()` and/or `NAV_CAP_BY_HREF`, so a
non-entitled customer gets the locked/upgrade state rather than a blank page.

| # | featureId | catalog | FeatureControl | customerVisible | status | adminOnly | requiredPlan | minTierIndex | Plan.featureFlags override | page exists | API gates | customer nav | rendered to customers | locked correctly |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `inbox` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard`<br>`/dashboard/inbox` | 0 apiGate / 0 pageGate | `/dashboard`<br>`/dashboard/inbox` | YES | open (tier-0 or ungated) |
| 2 | `auto_reply` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 3 | `bot_configuration` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/bot` | 0 apiGate / 1 pageGate | `/dashboard/bot` | YES | gated (pageGate/navCap) |
| 4 | `customer_management` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/customers` | 0 apiGate / 0 pageGate | `/dashboard/customers` | YES | open (tier-0 or ungated) |
| 5 | `order_management` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/orders` | 0 apiGate / 0 pageGate | `/dashboard/orders` | YES | open (tier-0 or ungated) |
| 6 | `quick_replies` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/quick-replies` | 0 apiGate / 0 pageGate | `/dashboard/quick-replies` | YES | open (tier-0 or ungated) |
| 7 | `basic_analytics` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/analytics` | 0 apiGate / 0 pageGate | `/dashboard/analytics` | YES | open (tier-0 or ungated) |
| 8 | `products` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/products` | 0 apiGate / 0 pageGate | `/dashboard/products` | YES | gated (pageGate/navCap) |
| 9 | `customer_import` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/import` | 0 apiGate / 0 pageGate | `/dashboard/import` | YES | gated (pageGate/navCap) |
| 10 | `data_export` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/export` | 0 apiGate / 0 pageGate | `/dashboard/export` | YES | open (tier-0 or ungated) |
| 11 | `whatsapp_connection` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/settings/bridge` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 12 | `wallet` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/wallet`<br>`/dashboard/billing`<br>`/dashboard/settings`<br>`/dashboard/usage` | 0 apiGate / 0 pageGate | `/dashboard/wallet`<br>`/dashboard/billing`<br>`/dashboard/settings`<br>`/dashboard/usage` | YES | gated (pageGate/navCap) |
| 13 | `my_work` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/my-work` | 0 apiGate / 1 pageGate | `/dashboard/my-work` | YES | gated (pageGate/navCap) |
| 14 | `whatsapp_health` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/whatsapp-health` | 0 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 15 | `whatsapp_bridge` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | — none — | ✗ none | 0 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 16 | `advanced_automations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/automations` | 1 apiGate / 1 pageGate | `/dashboard/automations` | YES | gated (pageGate/navCap) |
| 17 | `broadcasts` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/broadcasts` | 5 apiGate / 1 pageGate | `/dashboard/broadcasts` | YES | gated (pageGate/navCap) |
| 18 | `broadcast_credits` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/broadcasts-pro` | 0 apiGate / 1 pageGate | `/dashboard/broadcasts-pro` | YES | gated (pageGate/navCap) |
| 19 | `recovery` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/recovery` | 0 apiGate / 1 pageGate | `/dashboard/recovery` | YES | gated (pageGate/navCap) |
| 20 | `segments` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/segments` | 1 apiGate / 1 pageGate | `/dashboard/segments` | YES | gated (pageGate/navCap) |
| 21 | `working_hours` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/working-hours` | 1 apiGate / 1 pageGate | `/dashboard/working-hours` | YES | gated (pageGate/navCap) |
| 22 | `team` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | — none — | `/dashboard/settings/team` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 23 | `lead_scoring` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/leads` | 0 apiGate / 1 pageGate | `/dashboard/leads` | YES | gated (pageGate/navCap) |
| 24 | `flow_builder` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/bot-builder`<br>`/dashboard/flow-builder` | 4 apiGate / 2 pageGate | `/dashboard/bot-builder`<br>`/dashboard/flow-builder` | YES | gated (pageGate/navCap) |
| 25 | `human_handoff` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 1 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 26 | `coupons_discounts` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/coupons` | 3 apiGate / 1 pageGate | `/dashboard/coupons` | YES | gated (pageGate/navCap) |
| 27 | `qr_broadcast_queue` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/qr-queue` | 4 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 28 | `escalations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/escalations` | 3 apiGate / 1 pageGate | `/dashboard/escalations` | YES | gated (pageGate/navCap) |
| 29 | `compliance_monitoring` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/compliance` | 0 apiGate / 1 pageGate | `/dashboard/compliance` | YES | gated (pageGate/navCap) |
| 30 | `meta_cloud` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/settings/meta-cloud`<br>`/dashboard/meta`<br>`/dashboard/meta-health` | 0 apiGate / 1 pageGate | `/dashboard/meta-health` | YES | gated (pageGate/navCap) |
| 31 | `monitoring_center` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 3 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 32 | `knowledge_base` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/knowledge`<br>`/dashboard/settings/ai-provider` | 9 apiGate / 1 pageGate | `/dashboard/knowledge` | YES | gated (pageGate/navCap) |
| 33 | `smart_assistant` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/agents` | 8 apiGate / 5 pageGate | `/dashboard/agents` | YES | gated (pageGate/navCap) |
| 34 | `advanced_insights` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 3 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 35 | `sales_pipeline` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 1 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 36 | `customer_segmentation` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 37 | `smart_campaign_builder` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 2 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 38 | `next_best_action` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 39 | `revenue_copilot` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/revenue-copilot` | 0 apiGate / 1 pageGate | `/dashboard/revenue-copilot` | YES | gated (pageGate/navCap) |
| 40 | `advanced_analytics` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/business-intelligence` | 5 apiGate / 4 pageGate | `/dashboard/business-intelligence` | YES | gated (pageGate/navCap) |
| 41 | `revenue_attribution` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 2 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 42 | `forecasting` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/revenue-forecast` | 0 apiGate / 1 pageGate | `/dashboard/revenue-forecast` | YES | gated (pageGate/navCap) |
| 43 | `funnel_analytics` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/funnel` | 0 apiGate / 0 pageGate | `/dashboard/funnel` | YES | open (tier-0 or ungated) |
| 44 | `business_performance` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/business` | 0 apiGate / 0 pageGate | `/dashboard/business` | YES | open (tier-0 or ungated) |
| 45 | `k1sms` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 1 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 46 | `sms_messaging` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/sms` | 0 apiGate / 0 pageGate | `/dashboard/sms` | YES | open (tier-0 or ungated) |
| 47 | `shipping_tracking` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/shipments` | 2 apiGate / 1 pageGate | `/dashboard/shipments` | YES | gated (pageGate/navCap) |
| 48 | `loyalty_rewards` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 49 | `team_routing` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 1 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 50 | `support_inbox` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 1 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 51 | `audit_log` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/audit-log` | 1 apiGate / 1 pageGate | `/dashboard/audit-log` | YES | gated (pageGate/navCap) |
| 52 | `integrations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/integrations`<br>`/dashboard/settings/providers` | 0 apiGate / 0 pageGate | `/dashboard/integrations`<br>`/dashboard/settings/providers` | YES | open (tier-0 or ungated) |
| 53 | `api_access` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/developer` | 3 apiGate / 3 pageGate | `/dashboard/developer` | YES | gated (pageGate/navCap) |
| 54 | `safety_controls` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/safety` | 2 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 55 | `revenue_pro` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/revenue-pro` | 0 apiGate / 1 pageGate | `/dashboard/revenue-pro` | YES | gated (pageGate/navCap) |
| 56 | `ai_operations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/ai-operations` | 0 apiGate / 1 pageGate | `/dashboard/ai-operations` | YES | gated (pageGate/navCap) |
| 57 | `system_health` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/system-health` | 0 apiGate / 1 pageGate | `/dashboard/system-health` | YES | gated (pageGate/navCap) |
| 58 | `multi_team` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 59 | `multi_branch` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | `/dashboard/branches` | 2 apiGate / 1 pageGate | `/dashboard/branches` | YES | gated (pageGate/navCap) |
| 60 | `multi_whatsapp` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | `/dashboard/settings/numbers` | 0 apiGate / 0 pageGate | `/dashboard/settings/numbers` | YES | gated (pageGate/navCap) |
| 61 | `custom_integrations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 6 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 62 | `approval_workflows` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | `/dashboard/approvals` | 2 apiGate / 1 pageGate | `/dashboard/approvals` | YES | gated (pageGate/navCap) |
| 63 | `advanced_reporting` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 64 | `white_label` | ✅ YES | ✅ YES | ❌ **false** | hidden | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | `/dashboard/white-label` | 1 apiGate / 1 pageGate | `/dashboard/white-label` | NO | gated (pageGate/navCap) |
| 65 | `dedicated_infra` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 66 | `priority_support` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 67 | `custom_dev` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 68 | `sla` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 69 | `custom_billing` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 70 | `playground` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/playground` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 71 | `ai_audit` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/ai-audit` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 72 | `testing_arena` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/testing-arena` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 73 | `arena` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/arena` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 74 | `command_center` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/command-center` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 75 | `system_intelligence` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/intel` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 76 | `brain` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/brain` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 77 | `knowledge_brain` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/knowledge-brain` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 78 | `sales_brain` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/sales-brain` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 79 | `demo` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/demo` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 80 | `monitoring` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/monitoring` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 81 | `feature_center` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=false | `/dashboard/feature-center` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 82 | `memberships` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/memberships` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 83 | `suggestions` | ✅ YES | ✅ YES | ❌ **false** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/suggestions` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
---

## 4. Every customer-facing hide condition in the codebase (Phase 9 classification)

Searched for: `customerVisible`, `requiredPlan`, `minTierIndex`, `adminOnly`,
`status`, `comingSoon`, `Plan.featureFlags`, `notFound()`, `redirect()`.

| # | Location | Condition | Class | Action |
|---|---|---|---|---|
| 1 | `lib/feature-control.ts` `getCustomerInvisibleFeatureIds()` | `where: { customerVisible: false }` | **A/legit — this IS the control** | keep, unchanged |
| 2 | `app/dashboard/nav-items.tsx:642` `navItemVisible()` | `disabledFeatures.has(featureId)` | **A/legit — the single visibility gate** | keep |
| 3 | `app/dashboard/nav-items.tsx:637-641` | role `can()`, `activated`, `metaMode`, workspace `modules` | **B/legit** — RBAC, pre-activation, QR-vs-Meta, Business-Type modules. Orthogonal to plan tier. | keep |
| 4 | `app/dashboard/nav-items.tsx:671` `accessibleWorkspaces()` | `if (locked) return !simple` — a plan-locked item is dropped entirely in compact nav mode | **C/BUG** — navigation disappears as a function of tier | **fix**: locked items follow the same compact-mode rule as unlocked ones |
| 5 | `lib/feature-control.ts:208` `isFeatureVisible()` | returns false on `killSwitch`, `adminOnly`, `status ∈ {disabled,hidden,deprecated}` | **C/BUG** — visibility inferred from entitlement/lifecycle | **fix**: `customerVisible` only |
| 6 | `lib/feature-control.ts:467,478,501` `seedFeatureRegistry()` | `customerVisible = !cap.comingSoon`, `status = comingSoon ? "hidden" : "enabled"`, and `customerVisible` is written in the **update** branch | **C/BUG** — every boot re-derives visibility and silently reverses admin intent | **fix**: create with `true`; never write `customerVisible` on update |
| 7 | `lib/feature-control.ts:614` `syncRegistryFromJson()` | `customerVisible: isAdmin ? false : (f.customerVisible ?? true)` on create | **C/BUG** — JSON registry can seed a canonical feature hidden | **fix**: always create `true` |
| 8 | `app/api/admin/feature-control/route.ts:14`, `[id]/route.ts:11` | zod `status` enum omits `coming_soon`, which the admin dropdown offers | **C/BUG** — choosing "قريباً" returns `400 bad_body` | **fix**: add `coming_soon` |
| 9 | `app/admin/feature-control/page.tsx:540` | visibility column renders **text only**; the toggle lives in the drawer | **C/BUG** vs Phase 4 (“must be a real persisted toggle” in the column) | **fix**: make the column an actual persisted toggle |
| 10 | `app/dashboard/layout.tsx:175` | `CommandPalette` is not passed `disabledFeatures` | **C/minor** — ⌘K disagrees with the sidebar | **fix**: pass it |
| 11 | `lib/membership/entitlements.ts:126` | `baseCapIndex >= cap.minTierIndex` | **A/legit — ENTITLEMENT** | keep |
| 12 | `lib/membership/entitlements.ts:123` | `Plan.featureFlags[cap.key]` explicit boolean | **A/legit — ENTITLEMENT** | keep |
| 13 | `lib/membership/entitlements.ts:226` Step 5 | `getDisabledFeatureIds()` (killSwitch / status / release train / dep chain) → `capabilities[id] = false` | **A/legit — ENTITLEMENT (admin kill switch)** | keep |
| 14 | `lib/membership/gate.ts` `pageGate/apiGate` | not entitled → `allowed:false` (page renders `LockedFeature`) / `402 capability_locked` | **A/legit — ENTITLEMENT** | keep, do not weaken |
| 15 | `app/dashboard/{demo,playground,testing-arena,arena/**,memberships,feature-center}/page.tsx` | `requireAdmin()` → `redirect("/dashboard")` | **B/legit internal surface** — these hrefs are only in `ADMIN_WORKSPACE`, never in customer nav | keep |
| 16 | `app/dashboard/settings/team/page.tsx`, `wallet`, `qr-queue` | `can(role, perm)` → redirect | **B/legit RBAC** (team-member permissions, not plan tier) | keep |
| 17 | `app/pricing`, `components/pricing/FeatureMatrix.tsx`, `app/admin/plans` | `comingSoon` / `minTierIndex` used to render the plan matrix | **B/legit — display of the pricing matrix, not nav hiding** | keep |

**46 of 46** dashboard pages that call `pageGate()` render `LockedFeature` (or an
upgrade CTA) — verified by script. No page 404s a customer purely for being
un-entitled.

---

## 5. Surface-coverage reality check (honest limitation)

Phase 5 asks that "the UI must discover all 83 canonical product features".
Measured against the customer navigation:

* **42 of 83** features have a destination inside a customer workspace.
* **41 of 83** have no customer nav destination **for any plan, including Enterprise**.

Breakdown of the 41:
* **2** have a page but reach it through Settings rather than a top-level nav item:
  `whatsapp_connection` (`/dashboard/settings/bridge`), `team` (`/dashboard/settings/team`).
* **17** are backend/API-only capabilities enforced by `apiGate` with no page of
  their own — e.g. `human_handoff`, `monitoring_center`, `advanced_insights`,
  `sales_pipeline`, `smart_campaign_builder`, `revenue_attribution`, `k1sms`,
  `team_routing`, `support_inbox`, `custom_integrations`, `advanced_reporting`,
  `auto_reply`, `whatsapp_bridge`, `customer_segmentation`, `loyalty_rewards`,
  `next_best_action`, `multi_team`.
* **5** are contractual plan perks with no software surface at all:
  `sla`, `priority_support`, `custom_dev`, `dedicated_infra`, `custom_billing`.
* **17** are internal/admin destinations living only in `ADMIN_WORKSPACE`.

**This is NOT tier-based hiding** — none of these 41 disappear *because of the
customer's plan*; they are absent for every plan equally, because no
customer-facing nav destination was ever built for them. Setting
`customerVisible = true` for all 83 is still correct and is what this work does,
but it cannot by itself create navigation that does not exist. Building 41 new
customer destinations would be inventing product surface, which is outside the
scope of a visibility reset and is flagged here rather than silently attempted.

The place where all 83 *are* enumerated to a customer today is the public
pricing matrix (`/pricing`, `components/pricing/FeatureMatrix.tsx`), which
renders every capability per tier.

---

## 6. Conclusion

The architecture is already close to the target: `customerVisible` is the only
flag the customer nav consults (`getCustomerInvisibleFeatureIds` →
`disabledFeatures` → `navItemVisible`), entitlement is fully separate
(`getEntitlements` → `pageGate`/`apiGate` → `LockedFeature`/402), and there is
no `adminOnly = true` row and no kill switch set in production.

Three things break the invariant and are fixed in the phases that follow:
1. 18 production rows carry `customerVisible = false`.
2. `seedFeatureRegistry()` re-derives `customerVisible` from `comingSoon` on
   every boot, so any admin decision is reversed by the next deploy.
3. Visibility is still inferable from `status`/`adminOnly`/`killSwitch` inside
   `isFeatureVisible()`, and the admin column is not a real toggle.
