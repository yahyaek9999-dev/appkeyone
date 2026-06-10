# KEYONE — Feature Entitlement & Gating Matrix
_Authoritative reference · generated 2026-06-10 · Final Owner Pass_

This is the single source of truth for **which feature belongs to which plan** and
**how it is enforced**. It reconciles the public pricing catalog
(`saas/lib/pricing/catalog.ts`) with the actual page/route gating in the app.

> **Integrity property (verified):** the public `/pricing` `FeatureMatrix` and the
> in-app gate (`getEntitlements`) BOTH read the same `CAPABILITIES`/`TIERS` from
> `lib/pricing/catalog.ts`. What a customer is sold === what is unlocked in-app.

---

## 1. Tier ladder (7 tiers)

| Index | Tier | Slug | Price/mo | Internal tier | Meta access |
|---|---|---|---|---|---|
| — | **Free** (no/expired subscription) | `none` (fallback) | $0 | basic | none |
| 0 | **Start** | `k_start` | $29 | basic | none |
| 1 | **Growth** | `k_growth` | $59 | pro | none |
| 2 | **Pro** ⭐ popular | `k_pro` | $119 | pro | limited |
| 3 | **Business** | `k_business` | $249 | max | limited |
| 4 | **Scale** | `k_scale` | $499 | max | full |
| 5 | **Enterprise** | `k_enterprise` | contact | companies | full |

**Free tier = the no-subscription fallback.** It allows CORE capabilities only and
is enforced by `FREE_TIER_ENFORCEMENT` (see §5). Start ($29) adds nothing
capability-wise over Free today except higher message/AI limits and a paid SLA of
service — Start and Free share capability index 0. (Consider giving Start a
differentiator — see roadmap in master report.)

---

## 2. Capability → minimum tier

| Capability key | Unlocks at | Category |
|---|---|---|
| `inbox`, `auto_reply`, `customer_management`, `order_management`, `quick_replies` | **Free / Start** (0) | Core |
| `advanced_automations`, `broadcasts`, `working_hours`, `team` | **Growth** (1) | Automation / Team |
| `knowledge_base`, `smart_assistant`, `advanced_insights`, `lead_scoring`, `sales_pipeline`, `customer_segmentation`, `smart_campaign_builder`, `advanced_analytics`, `revenue_attribution` | **Pro** (2) | Intelligence / Analytics |
| `multi_team`, `approval_workflows`, `advanced_reporting`, `flow_builder`, `multi_branch`, `loyalty_rewards` | **Business** (3) | Team / Reporting / Scale |
| `multi_whatsapp`, `api_access`, `custom_integrations` | **Scale** (4) | Scale & Integrations |
| `white_label`, `dedicated_infra`, `priority_support`, `custom_dev`, `sla` | **Enterprise** (5) | Enterprise |

---

## 3. Dashboard pages → entitlement (48 pages)

### Core / free (no gate — intentional)
`dashboard` (home KPIs), `inbox`, `orders` + `orders/[id]`, `products`, `customers` +
`customers/[id]`, `quick-replies`, `bot`, `whatsapp`, `settings` (+ `ai-provider`,
`meta-cloud`, `orders`, `team`), `usage`, `playground`, `system-health`, `demo`,
`compliance`, `safety`, `export`, `audit-log`, `escalations`, `integrations`.

> **Deliberate "core" calls:** `escalations` (angry-customer handling = core support
> trust) and `integrations` (connecting your store = core commerce value; only
> *custom/API* integrations are Scale+) are intentionally NOT gated. `export` stays
> core for data-portability trust.

### Gated (premium) — `pageGate(cap)` + `<LockedFeature>`

| Page | Capability | Min tier | Status |
|---|---|---|---|
| `analytics` | advanced_analytics | Pro | ✅ added |
| `business-intelligence` | advanced_analytics | Pro | ✅ added |
| `command-center` | advanced_analytics | Pro | ✅ added |
| `funnel` | advanced_analytics | Pro | ✅ added |
| `intel` | advanced_insights | Pro | ✅ added |
| `suggestions` | smart_assistant | Pro | ✅ added |
| `knowledge` | knowledge_base | Pro | ✅ added |
| `knowledge-brain` | smart_assistant | Pro | ✅ added |
| `sales-brain` | sales_pipeline | Pro | ✅ added |
| `leads` | lead_scoring | Pro | ✅ added |
| `revenue-copilot` | revenue_attribution | Pro | ✅ added |
| `revenue-forecast` | revenue_attribution | Pro | ✅ added |
| `recovery` | smart_campaign_builder | Pro | ✅ added |
| `coupons` | smart_campaign_builder | Pro | ✅ added |
| `segments` | customer_segmentation | Pro | ✓ pre-existing |
| `automations` | advanced_automations | Growth | ✓ pre-existing |
| `broadcasts` | broadcasts | Growth | ✅ added |
| `working-hours` | working_hours | Growth | ✅ added |
| `business` | advanced_reporting | Business | ✅ added |
| `branches` | multi_branch | Business | ✓ pre-existing |
| `approvals` | approval_workflows | Business | ✓ pre-existing |
| `flow-builder` | flow_builder | Business | ✓ pre-existing |
| `white-label` | white_label | Enterprise | ✓ pre-existing |

**Result: 23 premium pages gated (17 added this pass + 6 pre-existing).**

---

## 4. API routes → entitlement (defense-in-depth)

`apiGate(cap)` was added at the top of every handler (additive — existing auth /
RBAC / rate-limit / SSRF guards preserved). 402 `capability_locked` is returned
for entitled-but-locked users; fail-open for non-enforced users.

| Route(s) | Capability |
|---|---|
| `analytics/business`, `analytics/messaging`, `command-center`, `funnel` | advanced_analytics |
| `intel`, `intel/anomalies`, `copilot` | advanced_insights |
| `revenue-copilot`, `revenue-forecast` | revenue_attribution |
| `sales-brain` | sales_pipeline |
| `segments` | customer_segmentation |
| `customers/[id]/twin` | smart_assistant |
| `knowledge`, `knowledge/[id]`, `knowledge/brain/search`, `knowledge/import-file`, `knowledge/import-products`, `knowledge/import-url`, `knowledge-gaps`, `knowledge-gaps/[id]` | knowledge_base |
| `automations/rules` | advanced_automations |
| `coupons`, `coupons/[id]`, `coupons/[id]/redeem`, `recovery`, `recovery/action` | smart_campaign_builder |
| `working-hours` | working_hours |
| `branches` (+`[id]`), `flows` (+`[id]`), `approvals` (+`[id]`), `white-label` | (pre-existing) |

**Result: 34 premium routes gated (27 added this pass + 7 pre-existing).**

### Intentionally NOT cap-gated (with reason)
- `commerce/*` — tied to the core order/commerce flow; gating risks the core funnel.
- `settings/ai-provider*` — default KEYONE provider must work for everyone; only
  bring-your-own keys are arguably premium (left core to avoid breaking settings).
- `export` — data portability / trust.
- `escalations` — core support.
- Cron / webhook / health / internal routes — secret-guarded, not user features.

### Graceful-degradation fixes (cross-cutting premium on core pages)
- `components/insight-strip.tsx` (calls `/api/copilot`, mounted on core dashboard /
  customers / orders) now **hides silently on 402** instead of showing
  "Could not load insights." → no error noise for free users.
- `customers/[id]/twin` consumer (`inbox/customer-360.tsx`) already degrades
  (`if (!r.ok) return;`) — twin card simply doesn't render. No change needed.

---

## 5. Enforcement model (how gating actually bites)

`getEntitlements()` sets `enforce` = **`isKPlan || (isFallback && FREE_TIER_ENFORCEMENT)`**

| User state | `enforce` | Effect |
|---|---|---|
| `k_*` subscriber (new public plans) | **true** | Full capability gating — always |
| Legacy active sub (`starter`/`pro`/`business`/…) | **false** | Full access — **never touched** (protects current paying customers) |
| No subscription / expired (**Free tier**) | **`FREE_TIER_ENFORCEMENT`** | Core-only when the switch is ON |
| Suspended | n/a (`blocked`) | All gated off |

`FREE_TIER_ENFORCEMENT` (env, default **`0`/off**) is the **go-live revenue switch**.
- OFF (default): non-regressive — fallback users keep full access exactly as before.
- ON (`=1`): no-subscription / expired users are limited to CORE; premium surfaces
  show `<LockedFeature>` upgrade prompts. This is what closes the
  "new sign-up gets everything free" leak.

**Go-live step (see master report §9):** confirm no active paying customer lacks a
`Subscription` row, then set `FREE_TIER_ENFORCEMENT=1`.

---

## 6. Verification (this pass)
- `tsc --noEmit` — clean
- `next build` — success (48 pages, 136 routes)
- `verify:rbac` — PASS (136 routes; all mutating routes gated/waived)
- `verify:schema-parity` — PASS (60 models, SQLite ↔ Postgres lock-step)
- All changes additive: **46 files, +391 / −3**.
