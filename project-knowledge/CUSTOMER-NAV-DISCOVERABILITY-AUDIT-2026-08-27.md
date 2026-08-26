# Customer Navigation Discoverability Audit — 2026-08-27

Enterprise account `test1@wkeyone.com` (plan `k_enterprise`, QR connection mode),
production `https://w.keyone1.com`, deployed commit `80394b3`.

Every PASS below means five things were checked in the browser: **icon rendered,
label rendered, element visible, element clicked, correct page opened.** HTTP
status, route existence and source grep were used only to explain findings and to
find candidates — never to certify one.

---

## 1. Why the six destinations looked invisible

Commit `278fb7c` added six destinations to the customer workspaces. After
deploying it the sidebar still showed the old list, which looked like a filtering
bug in `navItemVisible()` / `navItemLocked()` / FeatureControl. It was none of
those:

| Check | Result |
|---|---|
| A. server bundle contains the new items | **TRUE** — `server/chunks/3280.js` holds `/dashboard/brain` inside the `automation` items array, in the same module as `/dashboard/agents`, which rendered fine |
| B. running process is on that build | **TRUE** — `DEPLOYED_COMMIT` and `/api/health` agreed after restart |
| C. server-rendered HTML uses the new nav | **TRUE** — an authenticated `fetch('/dashboard')` from inside the session returned HTML containing `لوحة الباقة` |
| D. browser DOM contains it | **FALSE** |

Only D differed, so the fault was in the client, not the product. The open tab
was still running the pre-deploy JS bundle: `F5` and `ctrl+shift+r` sent to the
embedded browser are reported as pressed but do not reload it, and `navigate` to
`https://w.keyone1.com/dashboard` normalised to the origin root without
re-navigating. Assigning `location.href` forced a real navigation and all six
appeared at once.

Two gates were independently ruled out rather than assumed:
`SELECT "featureId" FROM "FeatureControl" WHERE "customerVisible" = false`
returns **zero rows** in production, and `localStorage.keyone_nav_simple` was
`"0"` (expanded, not compact).

**This part was a verification-method defect, not a product defect.** What
follows are the product defects the audit then found.

---

## 2. Defects found and fixed

### 2.1 `/dashboard/plan` shipped permanently locked — `6ca4ac9`

An earlier edit in this session mapped `/dashboard/plan` to a capability named
`"plan"`. No such key exists in `CAPABILITIES`, so `caps["plan"]` is `undefined`
at **every** tier and `navItemLocked()` returned true forever. An Enterprise
customer saw `لوحة الباقة` greyed out behind a lock with the tooltip
"ترقية الباقة للوصول" — an upgrade prompt no plan on the price list could satisfy.
`/dashboard/plan` is a plan-overview page, not a purchasable capability; both
mappings were removed.

### 2.2 Four sold capabilities had no customer entry — `fefff83`, `80394b3`

`nav-items.tsx` states the rule itself: a page built with `pageGate()` +
`<LockedFeature>` **is** a customer surface and must have a customer nav entry;
only `requireAdmin()` pages belong in `ADMIN_WORKSPACE`. Four destinations
violated it — each gated on a capability that is on the price list:

| Route | Capability | Min tier | Was |
|---|---|---|---|
| `/dashboard/intel` | `advanced_insights` | Pro | admin-only |
| `/dashboard/meta` | `meta_cloud` | every tier | admin-only |
| `/dashboard/settings/bridge` | `whatsapp_bridge` | Growth | no entry at all |
| `/dashboard/command-center` | `advanced_analytics` | Pro | help-drawer link only |

None calls `requireAdmin()`. `/dashboard/command-center`'s own locked copy
advertises the tier — "متاح في باقة Pro فأعلى" — while being unreachable from the
product. All four now sit in Analytics / Conversations; `/dashboard/meta` is
mode-scoped to Meta tenants, matching `meta-health`.

### 2.3 The connect-WhatsApp CTA was a dead end — `fefff83` (most severe)

`/dashboard/whatsapp` redirected to `/dashboard/qr-queue`, which calls
`requireAdmin()` and bounces a customer to `/dashboard`.

Seven customer entry points feed that URL: the "واتساب غير متصل" health banner,
activation step 1, the getting-started card, the dashboard alert link, the
product tour and two help-drawer entries. **Verified in production before the
fix**: clicking `اربط واتساب` — the most prominent CTA in the product, and step 1
of 6 in onboarding — returned the customer to the page they started on.
Onboarding step 1 was impossible to complete from the dashboard.

It now redirects to `/dashboard/settings/bridge` — KEYONE Bridge, the destination
that actually is the customer's WhatsApp connection product, verified in the
browser to open the 6-step connect flow. That page is
`pageGate("whatsapp_bridge")` + `<LockedFeature>`, so a tier that has not bought
it sees the upgrade path instead of a silent bounce.

The WhatsApp **send pipeline is untouched**: the changed file contains nothing
but a redirect statement.

### 2.4 The ADMIN_WORKSPACE policy comment had drifted — `fefff83`

It still named all of this audit's surfaces as operator consoles. Corrected, with
the check to run (`grep requireAdmin` on the page) before adding a name to it.
The comment already carried a warning that it had drifted once; it had drifted
again. Hand-maintained hidden-route lists have now failed twice here, which is
why §4 replaces the list with a test.

---

## 3. Verification — 60 destinations + 14 sub-pages, all clicked

### 3.1 Every nav destination, by workspace

Each row: rail glyph clicked, item read from the DOM, item clicked, landing route
and page heading recorded. `ok` = landed route equals the item's href.

| Workspace | Items | Icon | Clicked | Correct page | Locked |
|---|---|---|---|---|---|
| الرئيسية | 3 | 3/3 | 3/3 | 3/3 | 0 |
| المحادثات | 7 | 7/7 | 7/7 | 7/7 | 0 |
| العملاء | 4 | 4/4 | 4/4 | 4/4 | 0 |
| المبيعات | 4 | 4/4 | 4/4 | 4/4 | 0 |
| التسويق | 4 | 4/4 | 4/4 | 4/4 | 0 |
| الأتمتة | 11 | 11/11 | 11/11 | 11/11 | 0 |
| التحليلات | 13 | 13/13 | 13/13 | 13/13 | 0 |
| الإعدادات | 14 | 14/14 | 14/14 | 14/14 | 1 |
| **Total** | **60** | **60/60** | **60/60** | **60/60** | **1** |

The eleven surfaced by this audit, with the page each one opened:

| # | Feature | Route | Workspace | Page opened | Status |
|---|---|---|---|---|---|
| 1 | لوحة الباقة | `/dashboard/plan` | الرئيسية | لوحة باقتك — KEYONE Enterprise | **PASS** |
| 2 | ربط واتساب | `/dashboard/settings/bridge` | المحادثات | KEYONE Bridge | **PASS** |
| 3 | صحة جلسة واتساب | `/dashboard/whatsapp-health` | المحادثات | صحة جلسة واتساب | **PASS** |
| 4 | ذاكرة المعرفة | `/dashboard/knowledge-brain` | الأتمتة | عقل المعرفة | **PASS** |
| 5 | مركز البيانات | `/dashboard/brain` | الأتمتة | مركز البيانات | **PASS** |
| 6 | مركز القيادة | `/dashboard/command-center` | التحليلات | مركز القيادة | **PASS** |
| 7 | رؤى متقدّمة عن العملاء | `/dashboard/intel` | التحليلات | اقتراحات المبيعات | **PASS** |
| 8 | ذكاء المبيعات | `/dashboard/sales-brain` | التحليلات | المبيعات | **PASS** |
| 9 | الاقتراحات | `/dashboard/suggestions` | التحليلات | فجوات المعرفة | **PASS** |
| 10 | مركز الرصد | `/dashboard/monitoring` | التحليلات | مركز الرصد | **PASS** |
| 11 | مركز Meta والفوترة | `/dashboard/meta` | المحادثات | mode-scoped — see §5 | **MODE-SPECIFIC** |

### 3.2 Sub-pages — opened from their parent, not by URL

A sub-page is discoverable when its parent is a nav destination and the parent
renders a visible link to it. Each was reached by clicking the parent in the
sidebar, then clicking the link inside the page.

| Sub-page | Parent | Link text | Visible | Clicked | Page opened |
|---|---|---|---|---|---|
| `settings/business-profile` | الحساب والنشاط | نوع النشاط والوحدات | ✓ | ✓ | نوع النشاط والوحدات |
| `settings/ai-provider` | الحساب والنشاط | مزوّد الخدمة | ✓ | ✓ | مزوّد الخدمة |
| `settings/meta-cloud` | الحساب والنشاط | واتساب — وضع الاتصال | ✓ | ✓ | واتساب — وضع الاتصال |
| `settings/orders` | الحساب والنشاط | إعدادات الطلبات | ✓ | ✓ | إعدادات الطلبات |
| `settings/team` | الحساب والنشاط | إدارة الفريق والأدوار | ✓ | ✓ | إدارة الفريق |
| `settings/numbers` | — | — | — | — | **is a nav item** (أرقام واتساب) |
| `settings/providers` | — | — | — | — | **is a nav item** (المزوّدون) |
| `settings/bridge` | — | — | — | — | **is a nav item** (ربط واتساب) |
| `settings/bridge/download` | ربط واتساب | تنزيل Bridge | ✓ | ✓ | تنزيل KEYONE Bridge |
| `settings/bridge/link` | ربط واتساب | ربط جهاز | ✓ | ✓ | ربط جهاز Bridge |
| `sms/credits` | رسائل SMS | الرصيد والمحفظة | ✓ | ✓ | رصيد SMS |
| `sms/messages` | رسائل SMS | سجل الرسائل | ✓ | ✓ | سجل الرسائل |
| `sms/providers` | رسائل SMS | مزوّدو SMS | ✓ | ✓ | مزوّدو SMS |
| `sms/templates` | رسائل SMS | قوالب الرسائل | ✓ | ✓ | قوالب SMS |
| `developer/docs` | مركز المطوّرين | مركز التوثيق الكامل | ✓ | ✓ | توثيق المطوّرين |
| `developer/sdk` | مركز المطوّرين | مكتبات SDK | ✓ | ✓ | مولّد SDK |
| `customers/import` | كل العملاء | استيراد | ✓ | ✓ | استيراد العملاء |

Dynamic detail routes — `customers/[id]`, `orders/[id]`, `settings/numbers/[id]`,
`settings/providers/[domain]` — are opened by clicking a row in their list page.
They are destinations of records, not of navigation, and correctly have no nav
entry.

### 3.3 The one locked destination

`/dashboard/white-label` is `minTierIndex 3` **and** `comingSoon: true`, so the
plan record does not grant it. Visible + locked + upgrade path is exactly the
prescribed behaviour for an un-entitled capability — correct, not a defect.

**One copy observation, deliberately not changed** (it would mean touching
entitlement or pricing messaging): the lock tooltip reads "ترقية الباقة للوصول" to
a customer already on the top plan. For a `comingSoon` capability the honest
string is "قريباً", not an upgrade prompt.

---

## 4. The 83 canonical capabilities

Reconciled mechanically against three signals — `NAV_FEATURE_BY_HREF`,
`NAV_CAP_BY_HREF`, and `pageGate("<cap>")` found by scanning every
`app/dashboard/**/page.tsx`.

| Bucket | Count |
|---|---|
| Has a customer nav destination | **59** |
| Reachable only through a nav parent | 0 |
| **Buried — customer surface, no way to reach it** | **0** |
| No nav destination of its own | 24 |

The 24 without a destination of their own, each justified from the page or the
code rather than asserted:

**Platform tooling — `requireAdmin()` or an admin redirect, proven (7):**
`playground`, `testing_arena`, `arena`, `demo`, `qr_broadcast_queue`,
`feature_center`, `memberships`. `qr_broadcast_queue` was confirmed in the
browser: requesting `/dashboard/qr-queue` as the Enterprise customer lands on
`/dashboard`. `memberships` redirects any non-admin; `feature_center` uses
`adminOnly`.

**Behaviour inside a destination that IS in the nav (13):** `auto_reply`
(الردود التلقائية), `team` + `team_routing` + `support_inbox` + `human_handoff`
(صندوق المحادثات and إدارة الفريق, `/api/inbox/assign`, `/api/settings/team`),
`customer_segmentation` (الشرائح — confirmed by `lib/membership/audit.ts`
`PROTECTED`), `revenue_attribution` (توقّع الإيرادات, same source),
`smart_campaign_builder` (استعادة العملاء, `/api/recovery`), `next_best_action`
(customer detail, `/api/customers/[id]/profile`), `custom_integrations`
(التكاملات, `/api/commerce/integrations`), `loyalty_rewards` (customer detail and
the automation rule builder), plus `sla` (internal tracking in
`lib/admin/attention.ts`).

**Commercial terms with no software surface (3):** `dedicated_infra`,
`priority_support`, `custom_dev`, `custom_billing`.

**One capability I could not account for:** `multi_team` (ENTERPRISE) is
referenced by nothing but `lib/pricing/catalog.ts` and the FeatureControl
auto-seeder — no page, no API route, no library code. In production its row reads
`status=enabled, customerVisible=true`. It may be the commercial name for
الفروع + إدارة الفريق, both of which are reachable, or it may be sold and
undelivered. I could not prove which, and it is a pricing question rather than a
visibility one, so nothing was changed. **Worth resolving before membership
sales**, since plan comparisons will advertise it.

---

## 5. Meta connection mode — the one thing not proven in a browser

`/dashboard/meta` and `/dashboard/meta-health` carry `mode: "meta"`, so they
appear only for tenants on Meta Cloud. This account is on QR.

What is proven:

- Both pages open for this account and render unlocked content (`/dashboard/meta`
  returned 200 with no `<LockedFeature>`; `meta_cloud` is minTierIndex 0).
- Both are listed in the Conversations workspace, visible and unlocked under
  `metaMode: "meta"` and hidden under `"qr"` — asserted by regression test.
- The mode mechanism itself works in the live UI: the QR counterpart,
  `صحة جلسة واتساب`, renders and clicks for this tenant, and the Meta pair does not.

What is **not** proven: a browser click on those two nav items as a Meta tenant.

There is no sanctioned way to get one. Creating a tenant means creating an
account; flipping this tenant's connection mode would modify a live customer's
WhatsApp configuration on a production SaaS. Both were rejected. Recorded as
**UNVERIFIED by browser**, proven by test and by page behaviour.

---

## 6. Regression tests

`__tests__/customer-nav-discovery.test.ts` (28) and
`__tests__/customer-surface-coverage.test.ts` (3) — 31 passing.

The coverage suite is the one that replaces hand-auditing. It walks
`app/dashboard/**/page.tsx`, strips comments, classifies each page by what it
actually calls — `requireAdmin()` is platform tooling, `pageGate()` +
`<LockedFeature>` is a customer surface — and fails if a customer surface is
neither a nav destination nor beneath one. Sub-pages opened from their parent
count as reachable; `/dashboard` is explicitly excluded as a parent, guarded by
its own assertion, because allowing it would let every route pass trivially.

Also added:

1. Every `NAV_CAP_BY_HREF` value must be a real catalog capability — the §2.1 bug
   class, where a bogus key locks a destination forever at every tier.
2. The top tier owns every **shipped** capability, so nothing shipped renders
   locked. `comingSoon` is excluded explicitly so the assertion agrees with
   production instead of quietly diverging from it.
3. The audited destinations stay listed, visible and unlocked, each judged under
   its own connection mode.

Both suites were verified to actually catch their bug rather than assumed to:
re-introducing the `"plan"` mapping fails 3 assertions naming the href, and
deleting the `/dashboard/monitoring` nav item fails the coverage test naming the
route and the capability it sells.

---

## 7. Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run build` | pass — compiled successfully |
| nav + surface + visibility-invariant suites | 49/49 pass |
| Full `__tests__/` suite | 236 pass, **17 fail** — see below |

**Pre-existing failure, not caused by this work and not papered over:**
`__tests__/phase3-admin-features.test.ts` asserts
`project-knowledge/master-feature-registry.json` holds 77 entries (61 feature /
13 subfeature / 3 admin) with 56 discoverable. The file holds **98** entries
(62 / 21 / 15) with `discoverable` false on every row. The fixture and the
assertions describe a registry snapshot that no longer exists. Neither the test
nor the registry was touched here. Reported as **UNVERIFIED and out of scope** —
rewriting the assertions to match the current file would manufacture a pass
without establishing which of the two is correct.

---

## 8. Deployment

Deployed with the documented procedure, `deploy/release-aws.sh <commit>`, from
`project-knowledge/DEPLOYMENT_RULES.md`. No new mechanism was invented.

| Commit | Contents |
|---|---|
| `278fb7c` | six destinations added to customer workspaces (pre-existing) |
| `6ca4ac9` | `/dashboard/plan` unlock + first regression tests |
| `fefff83` | intel / meta / bridge surfaced; connect CTA unbroken; policy comment corrected |
| `a64e294` | `comingSoon` modelled in the unlocked-at-top-tier assertion |
| `80394b3` | مركز القيادة surfaced; customer-surface coverage test |

`DEPLOYED_COMMIT` on `ubuntu@16.171.230.84:~/keyone` equals `HEAD`
(`80394b3eaee2730704af02efd55850f961602e2e`), and `/api/health` reports
`{"status":"ok","db":"ok","version":"80394b3"}`.

Not touched, as instructed: pricing, memberships, customer subscriptions, the
entitlement matrix, customer data, and the WhatsApp send pipeline.

---

## 9. Final status

| Measure | Result |
|---|---|
| Missing customer nav entry | **0** |
| Missing icon | **0** |
| Broken click | **0** |
| Wrong destination | **0** |
| Customer-safe page with no entry | **0** |
| Buried capability | **0** |
| Locked for Enterprise | 1 — `white_label`, correct (`comingSoon`) |
| Unverified by browser | 2 — the Meta-mode pair, no sanctioned tenant (§5) |
| Open question for the business | 1 — `multi_team` has no implementation (§4) |
