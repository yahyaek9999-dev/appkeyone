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

## 4. The 83 canonical capabilities — full matrix

Reconciled mechanically against `NAV_FEATURE_BY_HREF`, `NAV_CAP_BY_HREF`, and
`pageGate("<cap>")` found by scanning every `app/dashboard/**/page.tsx`, then each
non-nav capability classified from the page or the code rather than asserted.

| Status | Count | Meaning |
|---|---|---|
| **PASS** | 69 | icon, label, visible, clicked, correct page — all five checked |
| **ADMIN-INTERNAL** | 7 | `requireAdmin()` / `adminOnly` / non-admin redirect |
| **CONTRACTUAL** | 4 | commercial term, no software surface |
| **INTERNAL-NO-UI** | 1 | internal machinery, never a customer destination |
| **LOCKED** | 1 | `white_label` — `comingSoon`, correctly visible + locked |
| **MODE-SPECIFIC** | 1 | `meta_cloud` — see §5 |
| **BLOCKER** | 0 | — `multi_team` was the only one; closed 2026-08-27, see §4.1 |
| **Total** | **83** | zero unclassified |

| # | Feature | Plan | Customer surface | Workspace | Status |
|---|---|---|---|---|---|
| 1 | `arena` | ENTERPRISE | requireAdmin() | — | **ADMIN-INTERNAL** |
| 2 | `demo` | ENTERPRISE | requireAdmin() | — | **ADMIN-INTERNAL** |
| 3 | `feature_center` | ENTERPRISE | adminOnly | — | **ADMIN-INTERNAL** |
| 4 | `memberships` | ENTERPRISE | non-admin redirect | — | **ADMIN-INTERNAL** |
| 5 | `playground` | ENTERPRISE | requireAdmin() | — | **ADMIN-INTERNAL** |
| 6 | `qr_broadcast_queue` | GROWTH | requireAdmin() — bounce verified in browser | — | **ADMIN-INTERNAL** |
| 7 | `testing_arena` | ENTERPRISE | requireAdmin() | — | **ADMIN-INTERNAL** |
| 8 | `multi_team` | ENTERPRISE | `/dashboard/teams` — create/list/details/roster/scope/numbers | الإعدادات | **PASS** |
| 9 | `custom_billing` | ENTERPRISE | billing term, no software surface | — | **CONTRACTUAL** |
| 10 | `custom_dev` | ENTERPRISE | services term, no software surface | — | **CONTRACTUAL** |
| 11 | `dedicated_infra` | ENTERPRISE | infrastructure term, no software surface | — | **CONTRACTUAL** |
| 12 | `priority_support` | ENTERPRISE | support term, no software surface | — | **CONTRACTUAL** |
| 13 | `sla` | ENTERPRISE | lib/admin/attention.ts — internal SLA tracking | — | **INTERNAL-NO-UI** |
| 14 | `white_label` | ENTERPRISE | العلامة البيضاء — `/dashboard/white-label` | الإعدادات | **LOCKED** |
| 15 | `meta_cloud` | START | مركز Meta والفوترة — `/dashboard/meta` | المحادثات | **MODE-SPECIFIC** |
| 16 | `advanced_analytics` | PRO | ذكاء الأعمال — `/dashboard/business-intelligence` | التحليلات | **PASS** |
| 17 | `advanced_automations` | GROWTH | قواعد الأتمتة — `/dashboard/automations` | الأتمتة | **PASS** |
| 18 | `advanced_insights` | PRO | رؤى متقدّمة عن العملاء — `/dashboard/intel` | التحليلات | **PASS** |
| 19 | `advanced_reporting` | ENTERPRISE | أداء النشاط — `/dashboard/business` | التحليلات | **PASS** |
| 20 | `ai_audit` | PRO | مراجعة جاهزية المساعد — `/dashboard/ai-audit` | الأتمتة | **PASS** |
| 21 | `ai_operations` | PRO | عمليات الذكاء الاصطناعي — `/dashboard/ai-operations` | الأتمتة | **PASS** |
| 22 | `api_access` | PRO | مركز المطوّرين — `/dashboard/developer` | الإعدادات | **PASS** |
| 23 | `approval_workflows` | ENTERPRISE | الموافقات — `/dashboard/approvals` | الإعدادات | **PASS** |
| 24 | `audit_log` | PRO | سجل النشاط — `/dashboard/audit-log` | الإعدادات | **PASS** |
| 25 | `auto_reply` | START | الردود التلقائية · /dashboard/bot | — | **PASS** |
| 26 | `basic_analytics` | START | نظرة عامة — `/dashboard/analytics` | التحليلات | **PASS** |
| 27 | `bot_configuration` | START | الردود التلقائية — `/dashboard/bot` | الأتمتة | **PASS** |
| 28 | `brain` | ENTERPRISE | مركز البيانات — `/dashboard/brain` | الأتمتة | **PASS** |
| 29 | `broadcast_credits` | GROWTH | الحملات — `/dashboard/broadcasts-pro` | التسويق | **PASS** |
| 30 | `broadcasts` | GROWTH | حملات البثّ (متقدمة) — `/dashboard/broadcasts` | التسويق | **PASS** |
| 31 | `business_performance` | PRO | أداء النشاط — `/dashboard/business` | التحليلات | **PASS** |
| 32 | `command_center` | ENTERPRISE | مركز القيادة — `/dashboard/command-center` | التحليلات | **PASS** |
| 33 | `compliance_monitoring` | GROWTH | الامتثال والتسليم — `/dashboard/compliance` | المحادثات | **PASS** |
| 34 | `coupons_discounts` | GROWTH | الكوبونات — `/dashboard/coupons` | المبيعات | **PASS** |
| 35 | `custom_integrations` | ENTERPRISE | التكاملات · /api/commerce/integrations | — | **PASS** |
| 36 | `customer_import` | START | استيراد العملاء — `/dashboard/import` | العملاء | **PASS** |
| 37 | `customer_management` | START | كل العملاء — `/dashboard/customers` | العملاء | **PASS** |
| 38 | `customer_segmentation` | PRO | الشرائح · /dashboard/segments (audit.ts PROTECTED) | — | **PASS** |
| 39 | `data_export` | START | تصدير البيانات — `/dashboard/export` | التحليلات | **PASS** |
| 40 | `escalations` | GROWTH | التصعيدات — `/dashboard/escalations` | المحادثات | **PASS** |
| 41 | `flow_builder` | GROWTH | منشئ المحادثات — `/dashboard/bot-builder` | الأتمتة | **PASS** |
| 42 | `forecasting` | PRO | توقّع الإيرادات — `/dashboard/revenue-forecast` | التحليلات | **PASS** |
| 43 | `funnel_analytics` | PRO | قمع التحويل — `/dashboard/funnel` | التحليلات | **PASS** |
| 44 | `human_handoff` | GROWTH | صندوق المحادثات · /api/inbox/.../pause | — | **PASS** |
| 45 | `inbox` | START | نظرة عامة — `/dashboard` | الرئيسية | **PASS** |
| 46 | `integrations` | PRO | التكاملات — `/dashboard/integrations` | الإعدادات | **PASS** |
| 47 | `k1sms` | PRO | رسائل SMS — `/dashboard/sms` | التسويق | **PASS** |
| 48 | `knowledge_base` | PRO | قاعدة المعرفة — `/dashboard/knowledge` | الأتمتة | **PASS** |
| 49 | `knowledge_brain` | ENTERPRISE | ذاكرة المعرفة — `/dashboard/knowledge-brain` | الأتمتة | **PASS** |
| 50 | `lead_scoring` | GROWTH | العملاء المحتملون — `/dashboard/leads` | العملاء | **PASS** |
| 51 | `loyalty_rewards` | PRO | تفاصيل العميل + منشئ قواعد الأتمتة | — | **PASS** |
| 52 | `monitoring` | ENTERPRISE | مركز الرصد — `/dashboard/monitoring` | التحليلات | **PASS** |
| 53 | `monitoring_center` | GROWTH | مركز الرصد — `/dashboard/monitoring` | التحليلات | **PASS** |
| 54 | `multi_branch` | ENTERPRISE | الفروع — `/dashboard/branches` | الإعدادات | **PASS** |
| 55 | `multi_whatsapp` | ENTERPRISE | أرقام واتساب — `/dashboard/settings/numbers` | المحادثات | **PASS** |
| 56 | `my_work` | START | عملي اليوم — `/dashboard/my-work` | الرئيسية | **PASS** |
| 57 | `next_best_action` | PRO | تفاصيل العميل · /api/customers/[id]/profile | — | **PASS** |
| 58 | `order_management` | START | الطلبات — `/dashboard/orders` | المبيعات | **PASS** |
| 59 | `products` | START | المنتجات — `/dashboard/products` | المبيعات | **PASS** |
| 60 | `quick_replies` | START | الردود السريعة — `/dashboard/quick-replies` | المحادثات | **PASS** |
| 61 | `recovery` | GROWTH | استعادة العملاء — `/dashboard/recovery` | التسويق | **PASS** |
| 62 | `revenue_attribution` | PRO | توقّع الإيرادات · revenue-forecast (audit.ts PROTECTED) | — | **PASS** |
| 63 | `revenue_copilot` | PRO | فرص الإيرادات — `/dashboard/revenue-copilot` | التحليلات | **PASS** |
| 64 | `revenue_pro` | PRO | تحليلات الإيرادات المتقدمة — `/dashboard/revenue-pro` | التحليلات | **PASS** |
| 65 | `safety_controls` | PRO | لوحة السلامة والحماية — `/dashboard/safety` | الإعدادات | **PASS** |
| 66 | `sales_brain` | ENTERPRISE | ذكاء المبيعات — `/dashboard/sales-brain` | التحليلات | **PASS** |
| 67 | `sales_pipeline` | PRO | ذكاء المبيعات — `/dashboard/sales-brain` | التحليلات | **PASS** |
| 68 | `segments` | GROWTH | الشرائح — `/dashboard/segments` | العملاء | **PASS** |
| 69 | `shipping_tracking` | PRO | الشحن والتتبّع — `/dashboard/shipments` | المبيعات | **PASS** |
| 70 | `smart_assistant` | PRO | المساعدات الذكية — `/dashboard/agents` | الأتمتة | **PASS** |
| 71 | `smart_campaign_builder` | PRO | استعادة العملاء · /api/recovery | — | **PASS** |
| 72 | `sms_messaging` | PRO | رسائل SMS — `/dashboard/sms` | التسويق | **PASS** |
| 73 | `suggestions` | ENTERPRISE | الاقتراحات — `/dashboard/suggestions` | التحليلات | **PASS** |
| 74 | `support_inbox` | PRO | صندوق المحادثات · /api/inbox/assign | — | **PASS** |
| 75 | `system_health` | PRO | صحة النظام — `/dashboard/system-health` | الإعدادات | **PASS** |
| 76 | `system_intelligence` | ENTERPRISE | رؤى متقدّمة عن العملاء — `/dashboard/intel` | التحليلات | **PASS** |
| 77 | `team` | GROWTH | إدارة الفريق · settings/team (sub-page, clicked) | — | **PASS** |
| 78 | `team_routing` | PRO | صندوق المحادثات · /api/inbox/assign | — | **PASS** |
| 79 | `wallet` | START | المحفظة والرصيد — `/dashboard/wallet` | الإعدادات | **PASS** |
| 80 | `whatsapp_bridge` | GROWTH | ربط واتساب — `/dashboard/settings/bridge` | المحادثات | **PASS** |
| 81 | `whatsapp_connection` | START | ربط واتساب — `/dashboard/settings/bridge` | المحادثات | **PASS** |
| 82 | `whatsapp_health` | START | صحة جلسة واتساب — `/dashboard/whatsapp-health` | المحادثات | **PASS** |
| 83 | `working_hours` | GROWTH | ساعات العمل — `/dashboard/working-hours` | الأتمتة | **PASS** |

### 4.1 `multi_team` — CLOSED 2026-08-27 (was: sold, not deliverable)

> **Status: BUILT AND SHIPPED.** Commit `ed4c8da`, live on production, verified in
> the browser on the Enterprise tenant. The finding below is the original
> diagnosis and is kept verbatim as the record of what was wrong. What closed it:
>
> | Gap found | What shipped |
> |---|---|
> | no `Team` model | `Team` — one workspace, many named teams, each carrying its own isolation policy. `TeamMember.teamId` nullable, `onDelete: SetNull` |
> | `conversationScope` read nowhere | `lib/teams/scope.ts` resolves it; `app/api/inbox/conversations/route.ts` now enforces the resolved scope instead of assuming `own_only` |
> | nothing writes either column | `POST/DELETE /api/teams/:id/members` writes both; the team-level policy is written by `POST/PATCH /api/teams` |
> | no screen | `/dashboard/teams` — create, list, details, roster, scope selector, number picker, empty state |
> | not in navigation | **الفرق والصلاحيات** in the الإعدادات workspace, `perm: "team"`, gated on `multi_team` |
>
> Non-regression: precedence is *member override → team policy → historical
> default*, where the default is `own_only` over all numbers. A member row with
> `teamId = NULL` and an empty override — every row that existed before this —
> resolves to exactly the restriction the inbox already hard-coded. Production
> held **0 `TeamMember` rows** at migration time, so no member behaviour could
> change. Migration DDL, backup and rollback: `MULTI-TEAM-MIGRATION-2026-08-27.md`.
>
> Production verification, on `test@wkeyone.com` (KEYONE Enterprise, a test
> tenant — no real customer was used): nav item visible with icon → clicked →
> page opened → team created (`تم إنشاء الفريق`) → scope changed to
> `كل محادثات المساحة` and saved (`تم حفظ إعدادات الفريق`, confirmed as
> `conversationScope='all'` in the database) → plan temporarily swapped to
> `k_growth`, which rendered the **locked** upgrade card while the nav entry
> stayed visible → plan restored to `k_enterprise/active` → test team deleted
> (`تم حذف الفريق`). Final state: 0 teams, 0 members, 4 users, 3 active
> Enterprise subscriptions — identical to before. All three writes are in
> `AuditLog` as `team.created` / `team.updated` / `team.deleted`.
>
> Locked by 54 tests across `__tests__/multi-team.test.ts` and
> `__tests__/multi-team-db.test.ts` (the latter runs against a real PostgreSQL
> for tenant isolation). Deleting the nav entry fails
> `customer-surface-coverage` — verified by actually deleting it.

#### Original finding (2026-08-27, before the fix)


The catalog sells it on Enterprise as **"فرق متعدّدة مع صلاحيات منفصلة"**
(Multi-Team with Isolated Permissions), distinct from `team` ("أعضاء الفريق حتى 5",
Growth), `team_routing` (Pro) and `multi_branch` (Enterprise). Every source was
checked:

| Source | Finding |
|---|---|
| `prisma/schema.postgres.prisma` | **no `Team` model exists.** `TeamMember` is a flat list of members under one owner. `Branch` has no member relation — branches carry name/phone/address/manager, no permission scoping |
| `TeamMember` fields | isolation primitives DO exist: `allowedNumberIds` (per-member WhatsApp-number access) and `conversationScope` (`own_only` \| `team` \| `all`) |
| Who writes them | **nothing.** `app/api/settings/team/route.ts` writes `role` only; no other endpoint, script or UI sets either field |
| Who reads them | `allowedNumberIds` in `app/api/inbox/conversations/route.ts` only. `conversationScope` is read **nowhere** — declared in the schema, never used |
| UI | `settings/team` manages members, roles and a fixed permission matrix. No team creation, no per-member number or scope control |
| Production `FeatureControl` | `status=enabled, customerVisible=true` |

So the isolation is enforced at read time but can never be configured — every
member keeps the defaults (`"[]"` = all numbers, `""` = role-based). A customer
cannot create a second team, and cannot give one team an isolated permission set.

**Verdict: (C) — a capability sold on the top plan that the product cannot
deliver as described.** No UI was invented for it. By the Enterprise rule this is
the audit's single **FAIL**: `customerVisible=true`, not admin, not contractual,
not `comingSoon`, and no customer-discoverable surface.

It is a commercial decision, not a navigation one. The options are to build
multi-team properly (a `Team` entity, or exposing `allowedNumberIds` +
`conversationScope` in `settings/team`), to remap the capability onto what
الفروع + إدارة الفريق actually deliver, or to withdraw it from the Enterprise
plan. **Blocks membership sales while Enterprise plan comparisons advertise it.**

## 5. Meta connection mode — UNVERIFIED, and why

`/dashboard/meta` and `/dashboard/meta-health` carry `mode: "meta"`, so they
appear only for tenants on Meta Cloud. This account is on QR.

Every sanctioned route to a Meta tenant was checked and none exists:

| Route | Finding |
|---|---|
| An existing Meta tenant | **none.** `SELECT connectionMode, count(*) FROM "Bot" GROUP BY 1` in production returns exactly one row: `qr \| 4`. Not one tenant in production has ever been on Meta Cloud |
| A seed / demo / test-tenant script | none in `scripts/` |
| A test mode or override | none. `metaMode` derives solely from `user.bot.connectionMode` (`app/dashboard/layout.tsx:78`) — no env flag, no query param, no dev switch |
| Creating a tenant | that is creating an account — not something I will do |
| Flipping this account's mode | modifies a live account's WhatsApp connection configuration on a production SaaS. Explicitly out of bounds |

What IS proven:

- Both pages open for this account and render unlocked content (`/dashboard/meta`
  returned 200 with no `<LockedFeature>`; `meta_cloud` is minTierIndex 0).
- Both are listed in Conversations, visible and unlocked under `metaMode: "meta"`
  and hidden under `"qr"` — asserted by regression test.
- The mode mechanism works in the live UI: the QR counterpart,
  `صحة جلسة واتساب`, renders and clicks for this tenant, and the Meta pair does not.

What is **not** proven: a browser click on those two nav items as a Meta tenant.
Recorded as **UNVERIFIED**, not folded into PASS.

Worth noting for the launch independently of this audit: **the Meta Cloud surface
has zero tenants in production**, so it has never been exercised by a real
merchant.

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
| Customer feature with no surface | **0** — `multi_team` closed 2026-08-27 (§4.1) |
| Customer feature with no icon | **0** |
| Broken click | **0** |
| Wrong destination | **0** |
| Hidden by entitlement | **0** |
| Customer-safe page with no entry | **0** |
| Enterprise entitlement/surface mismatch | **0** — `multi_team` closed 2026-08-27 |
| Locked for Enterprise | 1 — `white_label`, correct (`comingSoon`) |
| **UNVERIFIED** | 2 routes — the Meta-mode pair, no sanctioned tenant exists (§5) |

**NOT APPROVED for membership sales.** Navigation and discoverability are closed:
68 of 83 capabilities PASS with all five checks, and every remaining one is
classified with evidence. The blocker is commercial, not navigational —
`multi_team` is sold on the top plan and the product cannot deliver it. That
decision is the owner's, and no UI was invented to paper over it.
