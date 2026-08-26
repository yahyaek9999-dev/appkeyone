# Customer Navigation Discoverability Audit — 2026-08-27

Enterprise account `test1@wkeyone.com` (plan `k_enterprise`, QR connection mode),
production `https://w.keyone1.com`. Every result below was taken from the
rendered browser DOM of that account. HTTP status, route existence and source
grep were used only to *explain* findings, never to certify one.

---

## 1. Why the six destinations looked invisible

Commit `278fb7c` added six destinations to the customer workspaces. After
deploying it the sidebar still showed the old list, which looked like a
filtering bug in `navItemVisible()` / `navItemLocked()` / FeatureControl.

It was none of those. Traced end to end:

| Check | Result |
|---|---|
| A. server bundle contains the new items | **TRUE** — `server/chunks/3280.js` holds `/dashboard/brain` inside the `automation` items array, in the same module as `/dashboard/agents`, which rendered fine |
| B. running process is on that build | **TRUE** — `DEPLOYED_COMMIT` and `/api/health` both reported the pinned SHA after restart |
| C. server-rendered HTML uses the new nav | **TRUE** — an authenticated `fetch('/dashboard')` from inside the session returned HTML containing `لوحة الباقة` |
| D. browser DOM contains it | **FALSE** |

Only D differed, so the fault was in the client, not the product. The open tab
was still running the pre-deploy JS bundle: the `F5` and `ctrl+shift+r` key
presses sent to the embedded browser were never delivered as a reload, and
`navigate` to `https://w.keyone1.com/dashboard` normalised to the origin root
without re-navigating. Assigning `location.href` forced a real navigation and
all six appeared immediately.

`disabledFeatures` was independently ruled out: `SELECT "featureId" FROM
"FeatureControl" WHERE "customerVisible" = false` returns **zero rows** in
production, so that gate hides nothing. Nav density was ruled out too —
`localStorage.keyone_nav_simple` was `"0"` (expanded).

**This was a verification-method defect, not a product defect.** No product code
needed to change for the six. What follows are the real defects the audit then
found.

---

## 2. Defects found and fixed

### 2.1 `/dashboard/plan` shipped permanently locked — `6ca4ac9`

An earlier edit in this session mapped `/dashboard/plan` to a capability named
`"plan"`. No such key exists in `CAPABILITIES`, so `caps["plan"]` is `undefined`
at **every** tier and `navItemLocked()` returned true forever. An Enterprise
customer saw `لوحة الباقة` greyed out behind a lock, with the tooltip
"ترقية الباقة للوصول" — an upgrade prompt no plan on the price list could satisfy.

`/dashboard/plan` is a plan-overview page, not a purchasable capability. Both the
`NAV_CAP_BY_HREF` and `NAV_FEATURE_BY_HREF` entries were removed.

### 2.2 Three sold capabilities had no customer entry — `fefff83`

`nav-items.tsx` states the rule itself: a page built with `pageGate()` +
`<LockedFeature>` **is** a customer surface and must have a customer nav entry;
only `requireAdmin()` pages belong in `ADMIN_WORKSPACE`. Three destinations
violated it — each gated on a capability that is on the price list:

| Route | Capability | Min tier | Was |
|---|---|---|---|
| `/dashboard/intel` | `advanced_insights` | Pro (2) | admin-only |
| `/dashboard/meta` | `meta_cloud` | every tier (0) | admin-only |
| `/dashboard/settings/bridge` | `whatsapp_bridge` | Growth (1) | no entry at all |

None calls `requireAdmin()`. All three now sit in Analytics / Conversations.
`/dashboard/meta` is mode-scoped to Meta tenants, matching `meta-health`.

### 2.3 The connect-WhatsApp CTA was a dead end — `fefff83` (most severe)

`/dashboard/whatsapp` redirected to `/dashboard/qr-queue`, which calls
`requireAdmin()` and bounces a customer to `/dashboard`.

Seven customer entry points feed that URL: the "واتساب غير متصل" health banner,
activation step 1, the getting-started card, the dashboard alert link, the
product tour and two help-drawer entries. **Verified in production before the
fix**: clicking `اربط واتساب` — the most prominent CTA in the product, and step 1
of 6 in onboarding — returned the customer to the page they started on.
Onboarding step 1 was therefore impossible to complete from the dashboard.

It now redirects to `/dashboard/settings/bridge` — KEYONE Bridge, the destination
that actually is the customer's WhatsApp connection product. That page is
`pageGate("whatsapp_bridge")` + `<LockedFeature>`, so a tier that has not bought
it sees the upgrade path instead of a silent bounce.

The WhatsApp **send pipeline is untouched**: the changed file contains nothing
but a redirect statement.

### 2.4 The ADMIN_WORKSPACE policy comment had drifted — `fefff83`

The comment still named all eight of this audit's surfaces as operator consoles.
Corrected, with the check to run (`grep requireAdmin` on the page) before adding
a name to it. The comment already carried a warning that it had drifted once
before; it had drifted again.

---

## 3. Final matrix — Enterprise, production, browser DOM

Every row: workspace opened from the rail, item read from the DOM, item clicked,
resulting page confirmed.

| # | Feature | Route | Workspace | Icon | Visible | Clicked | Page opened | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | لوحة الباقة | `/dashboard/plan` | الرئيسية | ✓ | ✓ | ✓ | لوحة باقتك — KEYONE Enterprise | **PASS** |
| 2 | ذاكرة المعرفة | `/dashboard/knowledge-brain` | الأتمتة | ✓ | ✓ | ✓ | عقل المعرفة | **PASS** |
| 3 | مركز البيانات | `/dashboard/brain` | الأتمتة | ✓ | ✓ | ✓ | مركز البيانات | **PASS** |
| 4 | ذكاء المبيعات | `/dashboard/sales-brain` | التحليلات | ✓ | ✓ | ✓ | المبيعات · عقل المبيعات | **PASS** |
| 5 | الاقتراحات | `/dashboard/suggestions` | التحليلات | ✓ | ✓ | ✓ | فجوات المعرفة | **PASS** |
| 6 | مركز الرصد | `/dashboard/monitoring` | التحليلات | ✓ | ✓ | ✓ | مركز الرصد | **PASS** |
| 7 | رؤى متقدّمة عن العملاء | `/dashboard/intel` | التحليلات | ✓ | ✓ | ✓ | الرصد الذكي · اقتراحات المبيعات | **PASS** |
| 8 | ربط واتساب | `/dashboard/settings/bridge` | المحادثات | ✓ | ✓ | ✓ | KEYONE Bridge (6-step connect) | **PASS** |
| 9 | صحة جلسة واتساب | `/dashboard/whatsapp-health` | المحادثات | ✓ | ✓ | — | QR-mode counterpart, present | **PASS** |
| 10 | مركز Meta والفوترة | `/dashboard/meta` | المحادثات | — | — | — | `mode: "meta"`; this tenant is QR | **MODE-SPECIFIC** |
| 11 | حالة الاتصال | `/dashboard/meta-health` | المحادثات | — | — | — | `mode: "meta"`; this tenant is QR | **MODE-SPECIFIC** |
| 12 | العلامة البيضاء | `/dashboard/white-label` | الإعدادات | ✓ | ✓ | — | visible + locked + upgrade CTA | **LOCKED (correct)** |
| 13 | — | `/dashboard/qr-queue` | — | — | — | — | bounced to `/dashboard` | **ADMIN/INTERNAL** |
| 14 | — | `/dashboard/whatsapp` | — | — | — | ✓ | now lands on KEYONE Bridge | **LEGACY ALIAS (fixed)** |

Rows 10 and 11 are the one honest gap: their nav entries are mode-scoped to Meta
tenants and this account is on QR, so they cannot be clicked from this account's
sidebar. Their presence and unlocked state under `metaMode: "meta"` is locked by
regression test, and the mode mechanism itself is proven by row 9 — the QR
counterpart renders for this tenant. Confirming them in a browser needs a
Meta-mode tenant.

### Whole-surface regression sweep

All eight workspaces opened in sequence and read from the DOM:

| Workspace | Destinations | Missing icon | Locked |
|---|---|---|---|
| الرئيسية | 3 | 0 | 0 |
| المحادثات | 7 | 0 | 0 |
| العملاء | 4 | 0 | 0 |
| المبيعات | 4 | 0 | 0 |
| التسويق | 4 | 0 | 0 |
| الأتمتة | 11 | 0 | 0 |
| التحليلات | 12 | 0 | 0 |
| الإعدادات | 14 | 0 | 1 |
| **Total** | **59** | **0** | **1** |

The single locked destination is `/dashboard/white-label`: `minTierIndex 3` **and**
`comingSoon: true`, so the plan record does not grant it yet. Visible + locked +
upgrade path is exactly the prescribed behaviour for an un-entitled capability —
this is correct, not a defect.

**One copy observation, not changed** (it would mean touching entitlement or
pricing messaging): the lock tooltip reads "ترقية الباقة للوصول" to a customer who
is already on the top plan. For a `comingSoon` capability the honest string is
"قريباً", not an upgrade prompt.

---

## 4. Regression tests

`__tests__/customer-nav-discovery.test.ts` — 28 tests, all passing. Added:

1. **Every `NAV_CAP_BY_HREF` value is a real catalog capability.** This is the
   §2.1 bug class: a bogus key locks a destination forever at every tier.
2. **The top tier owns every shipped capability, so nothing shipped renders
   locked.** `comingSoon` capabilities are excluded explicitly, so the assertion
   agrees with production rather than quietly diverging from it.
3. **The nine audited destinations stay listed, visible and unlocked**, each
   judged under its own connection mode.

The tests were verified to actually catch the bug: re-introducing the `"plan"`
mapping fails 3 assertions with the offending href named. A test that passes but
would not have caught the defect is worth nothing, so this was checked rather
than assumed.

---

## 5. Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run build` | pass — compiled successfully |
| `__tests__/customer-nav-discovery.test.ts` | 28/28 pass |
| Full `__tests__/` suite | 236 pass, **17 fail** — see below |

**Pre-existing failure, not caused by this work and not papered over:**
`__tests__/phase3-admin-features.test.ts` asserts
`project-knowledge/master-feature-registry.json` holds 77 entries (61 feature /
13 subfeature / 3 admin) with 56 discoverable. The file actually holds **98**
entries (62 / 21 / 15) with `discoverable` false on every row. The fixture and
the assertions describe a registry snapshot that no longer exists. Neither that
test nor that registry was touched here, and the numbers are far apart enough
that no change in this session could explain them. It is reported as **UNVERIFIED
and out of scope** — rewriting the assertions to match the current file would
manufacture a pass without establishing which of the two is correct.

---

## 6. Deployment

Deployed with the documented procedure, `deploy/release-aws.sh <commit>`, from
`project-knowledge/DEPLOYMENT_RULES.md`. No new mechanism was invented.

| Commit | Contents |
|---|---|
| `278fb7c` | six destinations added to customer workspaces (pre-existing) |
| `6ca4ac9` | `/dashboard/plan` unlock + first regression tests |
| `fefff83` | intel / meta / bridge surfaced; connect CTA unbroken; policy comment corrected |
| `a64e294` | `comingSoon` modelled in the unlocked-at-top-tier assertion |

`DEPLOYED_COMMIT` on `ubuntu@16.171.230.84:~/keyone` matches `HEAD`, and
`/api/health` reports `{"status":"ok","db":"ok"}` on the same SHA.

Not touched, as instructed: pricing, memberships, customer subscriptions, the
entitlement matrix, customer data, and the WhatsApp send pipeline.
