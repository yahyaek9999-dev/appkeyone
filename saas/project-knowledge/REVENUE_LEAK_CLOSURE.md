# WKEYONE — Revenue Leak Closure (Phase 2)
**Generated:** 2026-08-17
**Source of truth:** `MASTER_FEATURE_REGISTRY_AUDIT.md`

---

## Summary

| | Count |
|---|---|
| Genuine gaps identified in Phase 1 | 13 |
| Fixed in Phase 1 (over-gating) | 2 |
| **Closed in this pass** | **4** |
| Reclassified — already enforced by limit | 1 |
| Reclassified — no real surface | 1 |
| Remaining open | 5 |

---

## CLOSED

### 1. `shipping_tracking` — Pro (tier 2)

| | |
|---|---|
| **Old behavior** | `/api/shipments` GET+POST and `/api/shipments/[id]/action` authenticated with `getUserIdForPermission("customers")` only. Any authenticated customer on any plan could list, create, sync, and notify shipments. |
| **Root cause** | Capability existed in the pricing catalog and was sold at Pro, but no gate call-site existed anywhere — page, nav, or API. |
| **Fix** | `apiGate("shipping_tracking", "customers")` on all three handlers. |
| **API boundary** | `app/api/shipments/route.ts` (GET, POST); `app/api/shipments/[id]/action/route.ts` (POST) |
| **Required plan** | `k_pro` |
| **Admin control** | Registry row `shipping_tracking`, release `commerce`, kill switch effective |
| **Release** | `commerce` |
| **Test** | denied without entitlement / allowed with / legacy unaffected / recommends `k_pro` |
| **Result** | ✅ PASS |

### 2. `team_routing` — Pro (tier 2)

| | |
|---|---|
| **Old behavior** | `POST /api/inbox/assign` checked auth + `can(role,"team")` only. Assigning conversations to staff/teams — a Pro feature — worked on Start and Growth. |
| **Root cause** | RBAC permission was mistaken for a commercial gate. Role answers *may this person*, not *does this plan include it*. |
| **Fix** | `apiGate("team_routing", "team")` — resolves auth, permission, and entitlement in one call. |
| **API boundary** | `app/api/inbox/assign/route.ts` (POST) |
| **Required plan** | `k_pro` |
| **Admin control** | Registry row `team_routing`, release `scale` |
| **Release** | `scale` |
| **Test** | 19 existing routing tests still pass + 4 new boundary tests |
| **Result** | ✅ PASS |

### 3. `support_inbox` — Pro (tier 2)

| | |
|---|---|
| **Old behavior** | `PATCH /api/inbox/assign` changed `queueState` (open/pending/resolved/closed) and SLA fields with no entitlement check. |
| **Root cause** | Same as above — queue/SLA management shipped before the capability was wired. |
| **Fix** | `apiGate("support_inbox")` on PATCH. |
| **API boundary** | `app/api/inbox/assign/route.ts` (PATCH) |
| **Required plan** | `k_pro` |
| **Admin control** | Registry row `support_inbox`, release `scale` |
| **Release** | `scale` |
| **Test** | 17 existing queue-state tests still pass + boundary tests |
| **Result** | ✅ PASS |

### 4. `custom_integrations` — Enterprise (tier 3)

| | |
|---|---|
| **Old behavior** | `/api/commerce/integrations` GET+POST used `requirePermission("settings")` only. Any plan could connect and list commerce integrations, including provider metadata. |
| **Root cause** | No capability gate; the most expensive tier's headline feature was open to Start. |
| **Fix** | `apiGate("custom_integrations", "settings")` on both handlers. |
| **API boundary** | `app/api/commerce/integrations/route.ts` (GET, POST) |
| **Required plan** | `k_enterprise` |
| **Admin control** | Registry row `custom_integrations`, release `scale` |
| **Release** | `scale` |
| **Test** | boundary tests, incl. no-data-leak on GET |
| **Result** | ✅ PASS |

---

## RECLASSIFIED — not leaks

### `multi_team` → enforced by LIMIT, correctly

`/api/settings/team` already enforces `ent.limits.team` and returns `402 seat_limit_reached`. Seats are a numeric allowance owned by the entitlement engine, which is exactly where Phase 2 of the directive requires limits to live.

Adding a capability gate here would create the duplicate source of truth the directive forbids. **Deliberately left as-is**, and a regression test now records the decision so a later pass does not "fix" it.

### `loyalty_rewards` → no real surface

No API route, no page, no lib module. The capability is advertised in the pricing matrix but nothing implements it. Gating a non-existent surface is meaningless.

**Classified NOT APPLICABLE** — either build it or drop it from the pricing matrix. Flagged for a product decision, not an engineering fix.

---

## REMAINING OPEN (5)

| Capability | Tier | Status | Reason |
|---|---|---|---|
| `human_handoff` | 1 Growth | PARTIAL | Runs inside the bot execution path. The handoff node is reached from `lib/bot/executor.ts`, not an HTTP boundary — gating needs care to avoid altering an in-flight conversation. Deferred rather than risk the message path. |
| `next_best_action` | 2 Pro | PARTIAL | NBA engine is invoked internally by intelligence jobs; no single customer-facing boundary. Needs a service-layer gate. |
| `revenue_copilot` | 2 Pro | COSMETIC | Page gates on `revenue_attribution` — same tier, so no customer is wrongly allowed or denied. Key mismatch only. |
| `forecasting` | 2 Pro | COSMETIC | Same as above. |
| `multi_whatsapp` | 3 Ent | PARTIAL | `/api/numbers` POST enforces `limits.whatsapp` **and** `isFeatureEnabled("multi_whatsapp")`. Creation is protected; the capability itself is not consulted on read paths. |

None of the five is an open paid-feature-for-free path of the kind closed above. Two are cosmetic, three are internal-boundary work.

---

## Why this could not break existing customers

`hasCapability()` short-circuits on `if (!ent.enforce) return true`. `enforce` is true only for `k_*` plan holders, or free tier when `FREE_TIER_ENFORCEMENT=1` — **verified `0` in production**.

| Customer type | Effect of these gates |
|---|---|
| Legacy (non-`k_*`) subscriber | none — `enforce=false` |
| Free / no subscription | none — `FREE_TIER_ENFORCEMENT=0` |
| `k_*` plan holder | gated per the plan they purchased (intended) |
| Suspended account | denied — pre-existing `blocked` behavior |

The WhatsApp send pipeline was not touched.

---

## Gates

TypeCheck 0 errors · Tests 135/135 (was 117) · Build 184 pages
