# Customer Dashboard Surfacing Audit — Enterprise

**Date:** 2026-08-26
**Deployed:** `ddc2ad87d5da8f5fa57b686e5545bcc68e6c1007`
**Account audited:** `s1test@wkeyone.com` — `k_enterprise`, active, **unchanged**
**Entitlement source:** live `GET /api/usage/entitlements` → 81 of 83 ON

> No pricing, plan, subscription, entitlement or FeatureControl data was
> changed. `FeatureControl` remains 83 rows / 83 visible / 0 hidden. All three
> subscriptions remain `k_enterprise`.

---

## The complaint, and what actually caused it

> "Enterprise has its entitled features enabled, but many of those features are
> NOT appearing in the customer's dashboard/navigation."

Correct, and it was **not** entitlement, `customerVisible`, `requiredPlan` or
`minTierIndex`. Measured with every runtime input read from production
(`role=owner`, `activated=true`, `connectionMode=qr`, all Business-Type modules
ON, zero `customerVisible=false` rows), the Enterprise customer was seeing

**17 of 48 navigation destinations.**

Two independent defects, both in `app/dashboard/nav-items.tsx`, plus a third
class of problem found while measuring.

### 1. Nav density defaulted to compact

```js
const [simple, setSimple] = useState(true);
useEffect(() => setSimple(localStorage.getItem(NAV_MODE_KEY) !== "0"), []);
```

An untouched key is `null`, and `null !== "0"` is **true** — so every principal
who had never opened the toggle started in beginner mode, with 31 destinations
suppressed. A paying customer's first sight of the product was a third of it.

Now only an explicit stored `"1"` means compact. Anyone who actually chose
"الأساسيات فقط" keeps it; everyone else sees the whole product. Beginner mode
is a deliberate choice, not a starting state.

### 2. Density was keyed off `enforce` — a plan-enforcement flag

```js
const simple = enforce ? _simple : false;
```

`enforce` is true for k_* plan holders and false for legacy/unenforced tenants.
So the **enforced, paying customer got the compact nav while a grandfathered
tenant always got the full one**. Entitlement had leaked into discovery one
layer below `customerVisible`. Now `isPlatformAdmin ? false : _simple` — density
is the user's preference, never the plan's.

### 3. Three sold features had no customer nav entry at all

Not a filter — a missing destination. These pages are built as customer
surfaces (`pageGate()` + `<LockedFeature>`, no `requireAdmin()` anywhere) yet
their only nav entry lived in `ADMIN_WORKSPACE`:

| feature | route | tier | why it was wrong |
|---|---|---|---|
| `whatsapp_health` | `/dashboard/whatsapp-health` | **0 — START** | every paying customer buys "WhatsApp Session Health"; none could reach it |
| `safety_controls` | `/dashboard/safety` | 2 — PRO | sold capability, customer-gated page, invisible |
| `ai_audit` | `/dashboard/ai-audit` | 2 — PRO | `35501a2` explicitly reclassified it "a Pro customer feature, not Enterprise QA" |

`whatsapp-health` is added as the QR-mode counterpart to the existing
`meta-health` (`mode:"meta"`), so every tenant now has exactly one
connection-health destination instead of none.

`/dashboard/qr-queue` was **left** admin-only: it genuinely calls
`requireAdmin()` and is documented as retired as a customer product. Verified in
production — a customer requesting it lands on the dashboard, not the queue.

---

## Result

| | before | after |
|---|---|---|
| customer destinations defined | 49 | 52 |
| surfaced to the Enterprise customer | **17** (default view) | **51** |
| suppressed by density filter | 31 | 0 |
| rendered LOCKED (visible, not entitled) | 1 | 1 |

The single remaining exclusion is `/dashboard/meta-health`, withheld from a
QR-connected tenant by `mode:"meta"` — a **connection-mode** rule, not a plan
rule, and now paired with its QR counterpart. Left untouched per instruction.

---

## Classification of all 83 canonical features for the Enterprise customer

    A) ENTITLED + CUSTOMER SURFACE + PRESENT IN NAV — 43
       inbox                    /dashboard /dashboard/inbox
       bot_configuration        /dashboard/bot
       customer_management      /dashboard/customers
       order_management         /dashboard/orders
       quick_replies            /dashboard/quick-replies
       basic_analytics          /dashboard/analytics
       products                 /dashboard/products
       customer_import          /dashboard/import
       data_export              /dashboard/export
       wallet                   /dashboard/wallet /dashboard/billing /dashboard/settings /dashboard/usage
       my_work                  /dashboard/my-work
       whatsapp_health          /dashboard/whatsapp-health
       advanced_automations     /dashboard/automations
       broadcasts               /dashboard/broadcasts
       broadcast_credits        /dashboard/broadcasts-pro
       recovery                 /dashboard/recovery
       segments                 /dashboard/segments
       working_hours            /dashboard/working-hours
       lead_scoring             /dashboard/leads
       flow_builder             /dashboard/bot-builder /dashboard/flow-builder
       coupons_discounts        /dashboard/coupons
       escalations              /dashboard/escalations
       compliance_monitoring    /dashboard/compliance
       knowledge_base           /dashboard/knowledge
       smart_assistant          /dashboard/agents
       revenue_copilot          /dashboard/revenue-copilot
       advanced_analytics       /dashboard/business-intelligence
       forecasting              /dashboard/revenue-forecast
       funnel_analytics         /dashboard/funnel
       business_performance     /dashboard/business
       sms_messaging            /dashboard/sms
       shipping_tracking        /dashboard/shipments
       audit_log                /dashboard/audit-log
       integrations             /dashboard/integrations /dashboard/settings/providers
       api_access               /dashboard/developer
       safety_controls          /dashboard/safety
       revenue_pro              /dashboard/revenue-pro
       ai_operations            /dashboard/ai-operations
       system_health            /dashboard/system-health
       multi_branch             /dashboard/branches
       multi_whatsapp           /dashboard/settings/numbers
       approval_workflows       /dashboard/approvals
       ai_audit                 /dashboard/ai-audit
    
    A*) ENTITLED + SURFACE EXISTS + MISSING FROM CUSTOMER NAV — 3
       whatsapp_connection      /dashboard/settings/bridge         reason: page exists, no nav destination
       team                     /dashboard/settings/team           reason: page exists, no nav destination
       meta_cloud               /dashboard/meta-health             reason: mode:meta-item-in-qr-mode
    
    B) NOT ENTITLED + CUSTOMER SURFACE (must render LOCKED) — 1
       white_label              /dashboard/white-label             shown:1 hidden:0
    
    C) CANONICAL FEATURE + NO CUSTOMER SURFACE (documented gap — nothing invented) — 22
       auto_reply               entitled=true
       whatsapp_bridge          entitled=true
       human_handoff            entitled=true
       monitoring_center        entitled=true
       advanced_insights        entitled=true
       sales_pipeline           entitled=true
       customer_segmentation    entitled=true
       smart_campaign_builder   entitled=true
       next_best_action         entitled=true
       revenue_attribution      entitled=true
       k1sms                    entitled=true
       loyalty_rewards          entitled=true
       team_routing             entitled=true
       support_inbox            entitled=true
       multi_team               entitled=true
       custom_integrations      entitled=true
       advanced_reporting       entitled=true
       dedicated_infra          entitled=true
       priority_support         entitled=true
       custom_dev               entitled=true
       sla                      entitled=true
       custom_billing           entitled=true
    
    D) ADMIN / INTERNAL ONLY (ADMIN_WORKSPACE, correctly not in customer nav) — 14
       qr_broadcast_queue       /dashboard/qr-queue
       playground               /dashboard/playground
       testing_arena            /dashboard/testing-arena
       arena                    /dashboard/arena
       command_center           /dashboard/command-center
       system_intelligence      /dashboard/intel
       brain                    /dashboard/brain
       knowledge_brain          /dashboard/knowledge-brain
       sales_brain              /dashboard/sales-brain
       demo                     /dashboard/demo
       monitoring               /dashboard/monitoring
       feature_center           /dashboard/feature-center
       memberships              /dashboard/memberships
       suggestions              /dashboard/suggestions
    
    TOTAL: 83 of 83

---

## Notes on each group

**A — 43 entitled, real surface, present in nav.** Verified against the live
entitlement matrix. Nothing in this group is hidden by any filter.

**A\* — 3 entitled, surface exists, not a top-level nav destination.**
* `whatsapp_connection` → `/dashboard/settings/bridge` and `team` →
  `/dashboard/settings/team` are **linked from the Settings page** (confirmed in
  `app/dashboard/settings/page.tsx`). Reachable, just not top-level — a
  legitimate information-architecture choice, not a filtering bug. Not changed.
* `meta_cloud` → `/dashboard/meta-health` is withheld from this QR tenant by
  `mode:"meta"`. It surfaces for a Meta-connected tenant. Connection mode, not
  plan. Not changed, per the instruction to leave Meta/Bridge/QR alone.

**B — 1 not entitled, real surface, renders LOCKED.** `white_label`:
`customerVisible=true`, `k_enterprise.featureFlags.white_label=false`, and
`NAV_CAP_BY_HREF["/dashboard/white-label"] = "white_label"` → `navItemLocked()`
returns true. Visible with a lock and an upgrade path, exactly as required. This
is the proof that locked ≠ hidden, obtained **without changing any membership
data**, because entitlement here is a plan-flag decision rather than a tier one.

**C — 22 canonical features with no customer surface.** Unchanged and nothing
invented. 17 are API-only capabilities enforced by `apiGate()` with no page of
their own; 5 are contractual perks with no software surface (`sla`,
`priority_support`, `custom_dev`, `dedicated_infra`, `custom_billing`). These
are absent for **every** plan including Enterprise — a missing-surface gap, not
tier-based hiding.

**D — 14 genuinely admin/internal.** All either call `requireAdmin()`
(`qr_broadcast_queue`, `playground`, `testing_arena`, `arena`, `demo`,
`feature_center`, `memberships`) or are operator consoles with no customer
meaning (`command_center`, `system_intelligence`, `brain`, `knowledge_brain`,
`sales_brain`, `monitoring`, `suggestions`). Correctly excluded.

---

## Regression protection

`__tests__/customer-nav-discovery.test.ts` (8 cases) locks the contract so
entitlement cannot leak back into discovery:

* the visible destination set is **identical across all four tiers**
* `enforce=true` removes no destination
* a START principal still **sees** `/dashboard/branches`, `/dashboard/approvals`
  and `/dashboard/white-label`, marked locked
* every locked item is also visible — locked is never hidden
* `customerVisible` removes exactly the destination it names and no other

Full suite: **205 passing, 0 failing.** Typecheck and production build clean.

---

## Still outstanding

The real-browser pass (clicking each workspace rail glyph and reading the
rendered sidebar) has not been run — the Browser pane has no authenticated
session. Everything above is measured from production HTTP responses, the live
entitlement API, production SQL, and an exact reproduction of `navItemVisible()`
/ `navItemLocked()` against the real runtime inputs. The browser pass would
confirm the same facts visually.
