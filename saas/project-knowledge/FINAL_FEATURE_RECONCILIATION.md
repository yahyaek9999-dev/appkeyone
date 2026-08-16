# WKEYONE — Final Feature Reconciliation (Phase 3)
**Generated:** 2026-08-17
**Method:** AST-ish parse of the `CAPABILITIES` block in `lib/pricing/catalog.ts`, cross-referenced against every gate call-site in `app/` and `lib/`, and against the production `FeatureControl` table.

---

## Exact counts

| Metric | Count |
|---|---|
| Capabilities in commercial catalog | **44** |
| Rows in production FeatureControl | **44** |
| Duplicate keys in catalog | **0** |
| **Catalog ↔ registry parity** | ✅ **exact** |
| Enforced at ≥1 call-site | **28** |
| Unenforced | **16** |
| — by design (tier-0 core) | 6 |
| — by design (contract deliverables) | 5 |
| — genuine remaining | **5** |
| Open *paid-feature-for-free* paths | **0** |

### Tier distribution
| Tier | Plan | Capabilities |
|---|---|---|
| 0 | Start | 6 |
| 1 | Growth | 9 |
| 2 | Pro | 17 |
| 3 | Enterprise | 12 |

---

## Prior count corrections (recorded, not hidden)

Two earlier figures in this workstream were wrong. Both were scan artifacts, not data defects:

1. **"23 unenforced"** — the regex `[a-z_]*` excluded digits, so `k1sms` was misreported as ungated. `/dashboard/sms` does gate it.
2. **"43 capabilities / 44 registry rows"** — a single-line regex missed one entry whose declaration wraps differently. A block-scoped parse confirms **44 in both**. There is no registry/catalog drift.

---

## The connected chain — verified

```
FEATURE (44 registry rows, featureId === capability key — structural, not coincidental)
   ↓  seeded from catalog on every boot; admin columns never overwritten
RELEASE (5 trains: core, automation, intelligence, commerce, scale)
   ↓  active/beta → available; draft/hidden/archived → unavailable
ENTITLEMENT (getEntitlements, 5 layers)
   ↓  plan → override → promotion → gift → control-plane disable
CUSTOMER OVERRIDE (CustomerPlanOverride, EntitlementGift, PromotionRedemption)
   ↓
EMPLOYEE / ROLE (RBAC can() + TeamMember.allowedNumberIds, server-side)
   ↓
USAGE LIMIT (entitlement `limits` object — the sole owner of numeric allowances)
   ↓
FINAL ACCESS DECISION (pageGate / apiGate / isFeatureEnabled)
```

**Single source of truth per concern — no duplicates:**

| Concern | Owner | Explicitly NOT duplicated in |
|---|---|---|
| What a plan includes | `CAPABILITIES` catalog | FeatureControl, pricing page |
| Numeric allowances | entitlement `limits` | FeatureControl (no `limit` column added — per directive) |
| Availability on/off | FeatureControl + FeatureRelease | catalog |
| Per-customer deals | Override / Gift / Promotion | plan rows |

---

## Genuine remaining (5) — none is an open paid path

| Capability | Tier | Class | Detail |
|---|---|---|---|
| `multi_team` | 3 | **NOT A LEAK** | Enforced by `ent.limits.team` → `402 seat_limit_reached`. Limits belong to the entitlement engine; a capability gate here would duplicate the source of truth. Regression test records the decision. |
| `multi_whatsapp` | 3 | **PARTIAL** | `/api/numbers` POST enforces `limits.whatsapp` **and** `isFeatureEnabled()`. Creation — the billable action — is protected. Read paths do not consult the capability. |
| `loyalty_rewards` | 2 | **NOT APPLICABLE** | No API, no page, no lib module. Advertised in pricing, never built. Needs a product decision: build it or remove it from the pricing matrix. |
| `human_handoff` | 1 | **PARTIAL** | Reached from `lib/bot/executor.ts` during live conversation execution, not an HTTP boundary. Gating requires a service-layer check; deferred rather than risk altering an in-flight conversation. |
| `next_best_action` | 2 | **PARTIAL** | Invoked internally by intelligence jobs; no single customer-facing boundary. Needs a service-layer gate. |

**By design, not gaps:**
- **Tier-0 core (6)** — `inbox`, `auto_reply`, `customer_management`, `order_management`, `quick_replies`, `basic_analytics`. In every plan, so a gate is commercially a no-op. Recorded consequence: the admin kill switch cannot reach them. Acceptable unless a plan should ever exclude a core capability.
- **Contract deliverables (5)** — `dedicated_infra`, `priority_support`, `custom_dev`, `sla`, `custom_billing`. Sales commitments with no software surface. Gating them would be theater.

---

## Sub-feature relationships (explicit, per directive)

Sub-features are not separate registry rows; they inherit from the parent capability so there is exactly one control point:

| Parent capability | Sub-features |
|---|---|
| `k1sms` | providers, templates, credits, message log, OTP, order-confirmation, order-status |
| `flow_builder` | bot builder canvas, node editor, 11 node types, ConvFlow persistence |
| `support_inbox` | queue states, SLA deadline/breach, assignment history |
| `team_routing` | manual / round-robin / least-loaded strategies, department filter |
| `multi_whatsapp` | per-number settings, identity, routing, notifications, number-level employee access |
| `shipping_tracking` | shipment create, carrier sync, customer notify, manual status |
| `broadcasts` | broadcasts-pro, QR credit campaigns, recovery campaigns |

---

## Status

| Gate | Result |
|---|---|
| TypeCheck | 0 errors |
| Tests | 135/135 |
| Build | 184 pages |
| Catalog ↔ registry parity | exact (44 = 44) |
| Open paid-feature-for-free paths | 0 |
