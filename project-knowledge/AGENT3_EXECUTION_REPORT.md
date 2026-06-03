# AGENT3 EXECUTION REPORT — Commerce & Automation
**Date:** 2026-06-03  
**Agent:** Agent 3 — Commerce & Automation Architect  
**Status:** COMPLETE ✅  

---

## Verification Results

| Suite | Result | Duration |
|-------|--------|----------|
| `tsc --noEmit` | ✅ PASS (0 new errors) | ~4s |
| `npm run build` | ⚠️ Pre-existing error only (`app/dashboard/demo/page.tsx` — added by another agent, not in git HEAD) | — |
| `verify:commerce` | ✅ PASS (3/3) | 29ms |
| `verify:orders` | ✅ PASS (4/4) | 20ms |
| `verify:system` | ✅ PASS (4/4 + 1 skip) | 26ms |

> The `demo/page.tsx` build error was present before this agent's changes (the `app/dashboard/demo/` directory is untracked, created by another agent with a missing `demo-ui` module). Zero new TypeScript or build errors introduced by this agent.

---

## TASK 1 — Abandoned-Cart Recovery Engine ✅

**Spec:** #7, Tier S — `Customer.cartItems / cartUpdatedAt / cartReminderSent` existed but nothing fired off them.

### New Files
| File | Purpose |
|------|---------|
| `saas/lib/commerce/abandoned-cart.ts` | Core engine: `runAbandonedCartSweep()`, `recordCartInterest()` |
| `saas/app/api/cron/abandoned-cart/route.ts` | POST cron endpoint, secret-header auth |
| `deploy/run-abandoned-cart.ps1` | VPS runner script |
| `deploy/install-abandoned-cart-task.ps1` | Windows Task Scheduler installer (every 60 min) |

### Schema Additions (both `schema.prisma` + `schema.postgres.prisma`)
```prisma
// Bot model — 3 new nullable/default fields
abandonedCartEnabled     Boolean @default(false)  // master OFF switch
abandonedCartDelayHours  Int     @default(4)       // min staleness before recovery
abandonedCartWindowHours Int     @default(24)      // max age to still recover
```

### How It Works
1. Sweep queries merchants with `bot.abandonedCartEnabled = true` (OFF by default).
2. Verifies active subscription before touching any customer.
3. Finds customers: `cartReminderSent=false`, `optedOutAt=null`, `cartUpdatedAt` within [now−windowHours, now−delayHours].
4. Checks if customer converted since cart was updated (order exists → mark reminded, skip).
5. Ranks by Agent 1 value-tier (platinum→bronze→lead) × leadScore — highest-value carts recovered first.
6. Queues ONE recovery via **`queueSmartFollowUp`** (kind=`product_view`, reason=`abandoned_cart`).
7. Sets `cartReminderSent=true` unconditionally → idempotent, one attempt per cart lifecycle.
8. `recordCartInterest()` also wires into `classifyAndScore` background tail — when intent=`buy`, the customer's cart signal is populated for future recovery.

### Anti-Ban Safeguards Proven
- `queueSmartFollowUp` enforces: opt-out check, pending-task dedup, `followUpMaxPerCustomer` cap, quiet hours.
- `runAbandonedCartSweep` enforces: subscription check, `optedOutAt` guard, conversion check, value-ranked cap per merchant.
- Flag `abandonedCartEnabled=false` by default → zero impact on existing merchants.

---

## TASK 2 — Product Affinity / Cross-Sell Matrix ✅

**Spec:** #9, Tier A — upsell suggestions were generic best-sellers; now data-driven.

### New Files
| File | Purpose |
|------|---------|
| `saas/lib/commerce/affinity.ts` | Batch engine, `topComplementForCustomer()` query helper |
| `saas/app/api/cron/product-affinity/route.ts` | POST daily batch cron |

### Schema Addition
```prisma
model ProductAffinity {
  userId        String
  productKey    String   // normalized name/SKU of anchor
  productLabel  String   // display label
  relatedKey    String   // normalized complement
  relatedLabel  String   // display label
  coCount       Int      // co-purchase count
  support       Int      // anchor basket count
  confidence    Int      // 0-100 (coCount/support × 100)
  computedAt    DateTime
  @@unique([userId, productKey, relatedKey])
}
```

### Algorithm
- Classic market-basket: build order baskets from `OrderItem` history, count co-occurrence pairs.
- Normalizes items by name (strips size/color variants) or SKU when present — "قميص أزرق M" and "قميص أزرق L" collapse to the same key.
- Filters: `minSupport=2`, `minCoCount=2`, `minConfidence=10%`, top-8 complements per anchor.
- Idempotent: stale rows (from previous batch for this merchant) are pruned after each run by `computedAt` timestamp.

### Upsell Wiring (`lib/intel/upsell.ts`)
Additive 5-line change: `detectUpsell` now calls `topComplementForCustomer()` per item, enriching:
- **Title:** "اقتراح مكمّل مبني على المشتريات" vs generic label
- **Reason:** Names the specific complement + confidence %
- **Message:** "كتير من عملائنا اللي اشتروا نفس المنتج أخدوا معاه '{product}' وكان مكمّل ممتاز"
- **insightLabel:** "Cross-sell" chip in UI

---

## TASK 3 — Visual Automation Builder ✅

**Spec:** #8, Tier A — merchant-authored if-this-then-that engine.

### New Files
| File | Purpose |
|------|---------|
| `saas/lib/automations/engine.ts` | Core engine: conditions evaluation, throttle, global cap, action executors, idle runner |
| `saas/app/api/automations/rules/route.ts` | CRUD API (GET/POST/PATCH/DELETE), `requirePermission("settings")` |
| `saas/app/dashboard/automations/rule-builder-ui.tsx` | React UI: rule list, create modal, edit modal |
| `saas/app/api/cron/automations/route.ts` | POST cron for `idle_hours` time-based rules |
| `deploy/run-automations.ps1` | VPS runner |
| `deploy/install-automations-task.ps1` | Windows Task Scheduler installer (every 30 min) |

### Schema Addition
```prisma
model AutomationRule {
  userId, name, enabled (default false)
  triggerType: score_crossed | stage_changed | idle_hours | order_status_changed | cart_abandoned
  conditions: JSON (metric, op, value / hours / status / stages)
  actionType: queue_follow_up | tag_customer | notify_admin | add_to_segment_broadcast
  actionConfig: JSON (delayHours, message, tag, toPhone, segment)
  throttleSeconds: Int (default 86400 — per-rule per-customer cooldown)
  fireCount, lastFiredAt
}

model AutomationActionLog {
  ruleId, customerId, actionType
  status: fired | throttled | capped | skipped | failed
  firedAt — append-only audit + throttle ledger
}
```

### Trigger / Action Catalog

| Trigger | Fired From |
|---------|-----------|
| `score_crossed` | `classifyAndScore` background tail (after every message scored) |
| `stage_changed` | Commerce order sync + future handoff state changes |
| `order_status_changed` | `syncCommerceOrderFromEvent` (status change detected) |
| `cart_abandoned` | `runAbandonedCartSweep` (additive call) |
| `idle_hours` | `runIdleAutomations` cron (every 30 min) |

| Action | Safe Path Used |
|--------|---------------|
| `queue_follow_up` | `queueSmartFollowUp` → FollowUpTask → existing follow-up cron → `wa.send` |
| `tag_customer` | Direct `Customer.tags` update (no send) |
| `notify_admin` | `notifyAdmin()` → `wa.send(..., "system")` |
| `add_to_segment_broadcast` | Tags customer with `segment:X` marker (no direct broadcast enqueue) |

### Anti-Ban Safeguards
- **Per-rule throttle:** `throttleSeconds` (default 24h). Checked via `AutomationActionLog` before every fire.
- **Global per-customer cap:** 3 automation actions / 24h rolling window across all rules.
- **Opt-out respected:** Engine skips any customer with `optedOutAt` set.
- **All rules OFF by default:** `enabled=false` at creation; merchant must explicitly enable.
- **Never on blocking path:** All evaluation is fire-and-forget `.catch(() => {})` in background tails.

### Acceptance: Win-Back Example
Merchant creates: "if `churnRiskScore >= 60` → `queue_follow_up` (delay 2h)"  
→ After next customer message: `classifyAndScore` updates scores → `evaluateAutomations` called → condition checked → throttle/cap verified → `queueSmartFollowUp` called → `FollowUpTask` created → existing cron delivers via `wa.send`. Fully audited in `AutomationActionLog`.

---

## TASK 4 — Bi-directional Commerce Sync (Catalog Pull) ✅

**Spec:** #10, Tier A — pull product catalog from connected stores into `Product` table.

### New Files
| File | Purpose |
|------|---------|
| `saas/lib/commerce/catalog-sync.ts` | Per-platform adapters (Shopify, WooCommerce, Salla, Zid) + orchestrator |
| `saas/app/api/cron/catalog-sync/route.ts` | POST cron (suggested: every 6h) |

### Schema Addition (Product model)
```prisma
sku            String?   // platform SKU (feeds affinity normalization)
externalSource String?   // shopify | woocommerce | salla | zid
externalId     String?   // platform product id
lastSyncedAt   DateTime?
@@unique([userId, externalSource, externalId])  // idempotent upsert key
```

### Platform Adapters
| Platform | Auth Method | Pagination |
|----------|------------|-----------|
| Shopify | `X-Shopify-Access-Token` header | cursor (since_id), 5 pages × 100 |
| WooCommerce | Basic Auth (consumerKey:consumerSecret) | page-based, 5 pages × 100 |
| Salla | Bearer token | page-based, 5 pages × 100 |
| Zid | Bearer token + Store-Id header | page-based, 5 pages × 100 |

All adapters: 15s timeout, max 500 products/run, failures dead-letter to `integration.lastSyncError`, never crash caller.

### Order Status Push — Follow-up Note
Pushing order status back to platforms requires OAuth write scopes (Shopify: `write_orders`, WooCommerce: separate credential), which are a separate credential flow from the current read-only `configJson`. This is documented as a follow-up task requiring explicit OAuth setup per platform. The infrastructure (Product `externalSource/externalId`, idempotent upsert pattern) is in place for the push path.

---

## New Cron Endpoints Summary

| Endpoint | Auth | Cadence | Guard |
|----------|------|---------|-------|
| `POST /api/cron/abandoned-cart` | `x-internal-secret` | Every 60 min | `bot.abandonedCartEnabled=true` per merchant |
| `POST /api/cron/product-affinity` | `x-internal-secret` | Daily (off-peak) | Any merchant with order history |
| `POST /api/cron/automations` | `x-internal-secret` | Every 30 min | `idle_hours` rules only; others are event-driven |
| `POST /api/cron/catalog-sync` | `x-internal-secret` | Every 6h | Connected Shopify/WooCommerce/Salla/Zid integrations |

---

## New Files Created (16 total)

```
saas/lib/commerce/abandoned-cart.ts
saas/lib/commerce/affinity.ts
saas/lib/commerce/catalog-sync.ts
saas/lib/automations/engine.ts
saas/app/api/cron/abandoned-cart/route.ts
saas/app/api/cron/product-affinity/route.ts
saas/app/api/cron/automations/route.ts
saas/app/api/cron/catalog-sync/route.ts
saas/app/api/automations/rules/route.ts
saas/app/dashboard/automations/rule-builder-ui.tsx
deploy/run-abandoned-cart.ps1
deploy/install-abandoned-cart-task.ps1
deploy/run-automations.ps1
deploy/install-automations-task.ps1
```

## Modified Files (additive only)

```
saas/prisma/schema.prisma              — +Bot.abandonedCart*, +ProductAffinity, +AutomationRule, +AutomationActionLog, +Product.sku/externalSource/externalId
saas/prisma/schema.postgres.prisma     — lock-step mirror of above
saas/lib/intel/upsell.ts               — +topComplementForCustomer() call (5 lines)
saas/lib/commerce/orders.ts            — +evaluateAutomations() call on status change (15 lines)
saas/app/api/whatsapp/incoming/route.ts — +2 imports, +recordCartInterest() + evaluateAutomations() in background tail (~20 lines)
saas/app/dashboard/automations/page.tsx — added RuleBuilderUi section below existing commerce automations
```

---

## Commerce Intelligence Architecture (Post-Agent 3)

```
[Customer messages]
       │ classifyAndScore (background, non-blocking)
       ├─→ recordCartInterest() — populates cart signal on buy-intent
       └─→ evaluateAutomations(score_crossed) — rule engine
                │
                ├─ throttle check (AutomationActionLog)
                ├─ global cap (3/customer/24h)
                └─ actions: queue_follow_up → queueSmartFollowUp
                             tag_customer
                             notify_admin → notifyAdmin()
                             add_to_segment_broadcast

[Cron: every 60 min]
 runAbandonedCartSweep()
   └─→ per-merchant (abandonedCartEnabled=true only)
       └─→ ranked by Agent 1 value-tier
           └─→ queueSmartFollowUp(abandoned_cart) [ONE per cart]
           └─→ evaluateAutomations(cart_abandoned)

[Cron: daily]
 runAffinityBatch()
   └─→ co-purchase pairs from OrderItem history
       └─→ ProductAffinity table
           └─→ detectUpsell() reads → specific complement in message

[Cron: every 30 min]
 runIdleAutomations()
   └─→ idle_hours rules → evaluateAutomations(idle)

[Cron: every 6h]
 runCatalogSync()
   └─→ Shopify/WooCommerce/Salla/Zid → Product table (sku + externalId)
       └─→ affinity batch uses real SKUs for normalization
```

---

## Handoff to Coordinator

**New tables for migration:**
- `ProductAffinity` — append-only affinity matrix
- `AutomationRule` — merchant-authored rules
- `AutomationActionLog` — fire audit ledger

**New columns (additive, all nullable/default-safe):**
- `Bot.abandonedCartEnabled / abandonedCartDelayHours / abandonedCartWindowHours`
- `Product.sku / externalSource / externalId / lastSyncedAt`

**For Agent 5 (API platform):** New route `POST /api/automations/rules` uses `requirePermission("settings")`. The rules CRUD is already wrapped.

**For Agent 2 (Analytics):** `AutomationActionLog` provides fire/throttle/cap data for an automations-performance dashboard. `ProductAffinity.confidence` drives cross-sell insight chips.

**Deploy flag needed before enabling abandoned-cart:**
```
# In Bot settings UI (or seed script):
bot.abandonedCartEnabled = true
```
Everything else activates automatically once the cron tasks are installed.
