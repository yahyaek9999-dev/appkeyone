# Feature Visibility Reset — Final Architecture & Production Verification

**Date:** 2026-08-26
**Commit deployed:** `3ec437c2bf5a115abd8c6e35cb88b02b7bbf30be`
**Production:** `ubuntu@16.171.230.84` → https://w.keyone1.com
**Phase 1 audit (pre-change):** [FEATURE_VISIBILITY_RESET_PHASE1_AUDIT.md](./FEATURE_VISIBILITY_RESET_PHASE1_AUDIT.md)

---

## The invariant, now structural

```
customerVisible  →  DISCOVERY.  The ONLY visibility control.
                    Exactly two states: ظاهر للعملاء / مخفي عن العملاء.
                    All 83 canonical catalog features are true.

the plan         →  ACCESS.     A visible feature the customer is not entitled
                    to renders LOCKED with an upgrade path.
                    Never hidden. Never a 404.
```

Nothing else can hide a feature from a customer: not `requiredPlan`, not
`minTierIndex`, not `Plan.featureFlags`, not `status`, not `adminOnly`, not
`killSwitch`, not `comingSoon`, not release state. Those inputs now feed the
entitlement layer only.

---

## Root cause — why this kept coming back

The bug was never in the toggle. It was in the **seed**.

`seedFeatureRegistry()` wrote `customerVisible` in its **UPDATE** branch,
derived from `!cap.comingSoon`. That function runs on **every process boot**
(`instrumentation.ts`) and on every "مزامنة من الكتالوج". So an admin could
turn a feature on, the DB would record it correctly, the API would return it
correctly — and the next deploy would silently re-derive the column from
catalog metadata and reverse the decision. Every previous fix corrected the
*data*; the mechanism that overwrote the data stayed in place.

`customerVisible` is now absent from that UPDATE branch entirely. Seeding may
CREATE a missing row; it may never re-decide an existing one.

---

## Changes

| Area | Before | After |
|---|---|---|
| `seedFeatureRegistry()` UPDATE | wrote `customerVisible = !cap.comingSoon` every boot | column not written at all — admin-owned |
| `seedFeatureRegistry()` CREATE | `customerVisible = !cap.comingSoon`, `status = comingSoon ? "hidden" : "enabled"` | `customerVisible = true` always; `status = "coming_soon"` for unbuilt |
| `syncRegistryFromJson()` CREATE | `admin_internal` type → created hidden | canonical catalog ids always created visible; only non-catalog plumbing may not be |
| `isFeatureVisible()` | false on `killSwitch` ∨ `adminOnly` ∨ `status ∈ {disabled,hidden,deprecated}` | returns `customerVisible`, nothing else |
| Nav compact mode | `if (locked) return !simple` — plan-locked items dropped entirely | locked items follow the same density rule as unlocked ones |
| Admin visibility column | read-only text; the only toggle was in the drawer and saved on "Save" | a real toggle in the row: one click → one PATCH → persisted |
| Admin drawer | a second toggle with different save semantics for the same field | read-only mirror — exactly one control on the page |
| Status vocabulary | dropdown offered `coming_soon`; both zod schemas rejected it → `400` | single `lib/feature-status.ts` drives dropdown *and* both schemas |
| Status labels | `hidden` shown as a visibility-sounding state | `مفعّل / معطّل / غير متاح / تجريبي / قريباً / قديم` — no "مخفي" |
| ⌘K palette | never received `disabledFeatures` — disagreed with the sidebar | receives it |
| `/dashboard/my-work` | `pageGate("my_work")` with no `NAV_CAP_BY_HREF` entry → no nav lock | mapped |

**Deliberately unchanged:** `Plan.featureFlags`, catalog tier data,
`getDisabledFeatureIds()`, `pageGate`/`apiGate`, and every `requireAdmin()`
guard on internal surfaces. Entitlement and API authorization are untouched.

---

## Production verification

### Invariant counts (live SQL, post-change)

```
 rows | visible_true | visible_false | admin_only | kill_switch
------+--------------+---------------+------------+-------------
   83 |           83 |             0 |          0 |           0

status: enabled 82 · coming_soon 1 (white_label)
```

Catalog = 83 · FeatureControl = 83 · catalog-only = 0 · DB-only = 0.

### Deploy

```
DEPLOYED_COMMIT  3ec437c2bf5a115abd8c6e35cb88b02b7bbf30be  == HEAD
/api/health      {"status":"ok","db":"ok","version":"3ec437c"}
keyone.service   active
failed units     0
```

### Toggle lifecycle — DB, API and customer UI in lockstep (no stale cache)

Feature `my_work`, nav href `/dashboard/my-work`:

| step | DB | admin API | customer nav |
|---|---|---|---|
| initial | `t` | `true` | present |
| admin toggles **OFF** → immediately | `f` | `false` | **absent** |
| after 35s (cache TTL fully elapsed) | `f` | `false` | absent |
| admin toggles **ON** → immediately | `t` | `true` | **present** |
| after 35s | `t` | `true` | present |

No stale visibility at any point, in either direction.

### Seed can no longer re-hide (the actual root cause, tested in production)

| action | `my_work` | `white_label` |
|---|---|---|
| admin sets `my_work` OFF | `false / enabled` | `true / coming_soon` |
| run "مزامنة من الكتالوج" (`seeded: 83`) | `false / enabled` ✅ | `true / coming_soon` ✅ |
| full `systemctl restart` (boot seed) | `false / enabled` ✅ | `true / coming_soon` ✅ |

The admin decision survived both. Under the previous code the boot seed
rewrote this column every time.

### Navigation does not vary by tier

`/dashboard` fetched as the same tenant at each tier; distinct `/dashboard/*`
hrefs in the server-rendered HTML:

| tier | hrefs | vs START |
|---|---|---|
| k_start | 10 | — |
| k_growth | 10 | **identical** |
| k_pro | 10 | **identical** |
| k_enterprise | 10 | **identical** |

The rendered destination set is the same at every tier. Nothing disappears
because of the plan.

### API authorization still enforced (Phase 6 — nothing weakened)

| capability (min tier) | START | GROWTH | PRO | ENTERPRISE |
|---|---|---|---|---|
| `segments` (Growth) | **402** | 200 | 200 | 200 |
| `broadcasts` (Growth) | **402** | 200 | 200 | 200 |
| `advanced_analytics` (Pro) | **402** | **402** | 200 | 200 |
| `api_access` (Pro) | **402** | **402** | 200 | 200 |
| `multi_branch` (Enterprise) | **402** | **402** | **402** | 200 |
| `approval_workflows` (Enterprise) | **402** | **402** | **402** | 200 |

Entitlement counts: **START 15 · GROWTH 31 · PRO 58 · ENTERPRISE 81** of 83
capability keys — while all 83 stay visible at every tier. Visible ≠ entitled,
exactly as intended.

The two Enterprise gaps are deliberate entitlement decisions, not visibility:
* `white_label` — `status = coming_soon` (genuinely not built). Visible, locked.
* `feature_center` — `Plan.featureFlags.feature_center = false` on `k_enterprise`.
  Visible, locked.

Granting either would mean weakening authorization, which Phase 6 forbids. Say
the word and I'll flip them.

### Regression suite

`197 passing · 0 failing · 28 skipped`. Typecheck clean against the Postgres
client; production build clean.

New `__tests__/feature-visibility-invariant.test.ts` (18 cases) locks the
contract: a clean seed yields **zero** hidden features; `comingSoon`,
`minTierIndex` and `adminOnly` never hide; an admin's OFF decision survives
repeated re-seeds; no status label contains "مخفي"; every status the dropdown
offers is accepted by the API schema.

---

## Honest limitation — discovery vs. the visibility flag

Phase 5 asks that the UI "discover all 83 canonical product features". Measured
against the customer navigation:

* **42 of 83** have a destination in a customer workspace.
* **41 of 83** have **no customer nav destination for any plan, including Enterprise** —
  17 are API-only capabilities enforced by `apiGate` with no page of their own;
  5 are contractual perks with no software surface (`sla`, `priority_support`,
  `custom_dev`, `dedicated_infra`, `custom_billing`); 17 are internal/admin
  destinations that live only in `ADMIN_WORKSPACE`; 2 sit under Settings rather
  than top-level nav.

**This is not tier-based hiding** — those 41 are absent for every plan equally,
because no customer-facing destination was ever built for them. Setting
`customerVisible = true` for all 83 is correct and done, but a flag cannot
create navigation that does not exist. Building 41 new customer destinations
would be inventing product surface, so it is reported here rather than silently
attempted. The surface that does enumerate all 83 to a customer today is the
pricing matrix (`/pricing`).

Related: of the 18 rows that were hidden before this work, **17 had no customer
nav entry at all** — only `white_label` was a destination a customer could
otherwise have reached. The visibility flag was wrong in all 18 cases and is
now right; the *visible* effect for customers is concentrated in `white_label`.

---

## Rollback

Pre-change state and a ready-to-run restore script are on the production box:

```
~/backups/featurecontrol-visibility-20260826T190318Z.txt
~/backups/restore-visibility-20260826T190318Z.sql
~/backups/subscriptions-before-visibility-test.txt
```

---

## Final 83-row matrix (post-change, live production)

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
| 27 | `qr_broadcast_queue` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/qr-queue` | 4 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 28 | `escalations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/escalations` | 3 apiGate / 1 pageGate | `/dashboard/escalations` | YES | gated (pageGate/navCap) |
| 29 | `compliance_monitoring` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/compliance` | 0 apiGate / 1 pageGate | `/dashboard/compliance` | YES | gated (pageGate/navCap) |
| 30 | `meta_cloud` | ✅ YES | ✅ YES | **true** | enabled | false | — (all) | 0 (START) | growth=true<br>start=true<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/settings/meta-cloud`<br>`/dashboard/meta`<br>`/dashboard/meta-health` | 0 apiGate / 1 pageGate | `/dashboard/meta-health` | YES | gated (pageGate/navCap) |
| 31 | `monitoring_center` | ✅ YES | ✅ YES | **true** | enabled | false | `k_growth` | 1 (GROWTH) | growth=true<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 3 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 32 | `knowledge_base` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/knowledge`<br>`/dashboard/settings/ai-provider` | 9 apiGate / 1 pageGate | `/dashboard/knowledge` | YES | gated (pageGate/navCap) |
| 33 | `smart_assistant` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/agents` | 8 apiGate / 5 pageGate | `/dashboard/agents` | YES | gated (pageGate/navCap) |
| 34 | `advanced_insights` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 3 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 35 | `sales_pipeline` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 1 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 36 | `customer_segmentation` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
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
| 48 | `loyalty_rewards` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 49 | `team_routing` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 1 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 50 | `support_inbox` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | ✗ none | 1 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 51 | `audit_log` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/audit-log` | 1 apiGate / 1 pageGate | `/dashboard/audit-log` | YES | gated (pageGate/navCap) |
| 52 | `integrations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/integrations`<br>`/dashboard/settings/providers` | 0 apiGate / 0 pageGate | `/dashboard/integrations`<br>`/dashboard/settings/providers` | YES | open (tier-0 or ungated) |
| 53 | `api_access` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/developer` | 3 apiGate / 3 pageGate | `/dashboard/developer` | YES | gated (pageGate/navCap) |
| 54 | `safety_controls` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/safety` | 2 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 55 | `revenue_pro` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/revenue-pro` | 0 apiGate / 1 pageGate | `/dashboard/revenue-pro` | YES | gated (pageGate/navCap) |
| 56 | `ai_operations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/ai-operations` | 0 apiGate / 1 pageGate | `/dashboard/ai-operations` | YES | gated (pageGate/navCap) |
| 57 | `system_health` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | growth=false<br>start=false<br>pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/system-health` | 0 apiGate / 1 pageGate | `/dashboard/system-health` | YES | gated (pageGate/navCap) |
| 58 | `multi_team` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 59 | `multi_branch` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | `/dashboard/branches` | 2 apiGate / 1 pageGate | `/dashboard/branches` | YES | gated (pageGate/navCap) |
| 60 | `multi_whatsapp` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | `/dashboard/settings/numbers` | 0 apiGate / 0 pageGate | `/dashboard/settings/numbers` | YES | gated (pageGate/navCap) |
| 61 | `custom_integrations` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 6 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 62 | `approval_workflows` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | `/dashboard/approvals` | 2 apiGate / 1 pageGate | `/dashboard/approvals` | YES | gated (pageGate/navCap) |
| 63 | `advanced_reporting` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 1 pageGate | ✗ none | NO | gated (pageGate/navCap) |
| 64 | `white_label` | ✅ YES | ✅ YES | **true** | coming_soon | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | `/dashboard/white-label` | 1 apiGate / 1 pageGate | `/dashboard/white-label` | YES | gated (pageGate/navCap) |
| 65 | `dedicated_infra` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 66 | `priority_support` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 67 | `custom_dev` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 68 | `sla` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 69 | `custom_billing` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | growth=false<br>start=false<br>pro=false<br>business=false<br>enterprise=true<br>scale=false | ✗ none | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 70 | `playground` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/playground` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 71 | `ai_audit` | ✅ YES | ✅ YES | **true** | enabled | false | `k_pro` | 2 (PRO) | pro=true<br>business=true<br>enterprise=true<br>scale=true | `/dashboard/ai-audit` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 72 | `testing_arena` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/testing-arena` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 73 | `arena` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/arena` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 74 | `command_center` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/command-center` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 75 | `system_intelligence` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/intel` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 76 | `brain` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/brain` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 77 | `knowledge_brain` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/knowledge-brain` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 78 | `sales_brain` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/sales-brain` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 79 | `demo` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/demo` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 80 | `monitoring` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/monitoring` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 81 | `feature_center` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=false | `/dashboard/feature-center` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 82 | `memberships` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/memberships` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |
| 83 | `suggestions` | ✅ YES | ✅ YES | **true** | enabled | false | `k_enterprise` | 3 (ENTERPRISE) | enterprise=true | `/dashboard/suggestions` | 0 apiGate / 0 pageGate | ✗ none | NO | n/a — no surface |