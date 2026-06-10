# KEYONE — Final Owner Pass
_2026-06-10 · prepared as founder/CTO/product/QA/launch owner · for the first 100 paying customers_

## TL;DR
KEYONE is a **mature, production Arabic-first WhatsApp commerce SaaS** with an
unusually complete feature set (AI replies, order extraction, broadcasts,
knowledge brain, sales/revenue intelligence, commerce integrations, Meta Cloud,
RBAC, audit log, security-hardened). The entitlement **architecture was excellent
but barely wired** — only 6/48 pages and 7/136 routes were gated, and enforcement
was off for everyone, so **premium features were effectively free**.

This pass **closed the subscription/monetization gap** (the stated #1 priority):
**23 premium pages + 34 premium routes are now gated**, a real **Free tier** was
introduced behind a safe go-live switch, and the upgrade experience renders
everywhere. All additive (46 files, +391/−3), typecheck + build + RBAC +
schema-parity all green. **One switch flips revenue protection on at go-live.**

The full page/route→plan mapping lives in
[`KEYONE_FEATURE_GATING_MATRIX_2026_06_10.md`](KEYONE_FEATURE_GATING_MATRIX_2026_06_10.md).

---

## 1. Product Audit

**What's already built & working** (verified against code + prior reports):
- **Core comms:** WhatsApp send/receive (queue, pacing, retry, idempotency,
  anti-ban/kill-switch), multi-provider AI Arabic replies (KEYONE default +
  OpenAI/Gemini/Claude/Groq/OpenRouter with caching/fallback).
- **Commerce:** order extraction, Customer 360, products, Shopify/Woo/Salla/Zid/
  custom integrations (HMAC webhooks, AES-GCM secrets), abandoned-cart + automation
  engine, coupons, recovery.
- **Intelligence:** knowledge base + Knowledge Brain (semantic search), lead
  scoring, sentiment/intent, sales brain, revenue copilot + forecast, intel /
  anomalies, segments, funnel, command center, business intelligence.
- **Growth:** broadcasts (CRUD + AI generate + A/B + optimize), follow-ups, daily
  report, working hours, escalations.
- **Platform:** 5-role RBAC + append-only audit log, self-service signup + admin
  approval, team invites, usage ledger + monthly reset, Sentry, health/ready
  probes, security hardening (CSP, SSRF guards, fail-closed auth secret, next CVE
  patched).
- **Monetization scaffolding:** 6 `k_*` public tiers seeded, catalog-driven
  `/pricing` (PricingExperience + FeatureMatrix + IndustryMatcher), billing UI
  (`LockedFeature`/`UpgradeModal`/`LimitBanner`/`UpgradeRequestPanel`), manual
  upgrade-request → admin-activation flow.

**The critical finding — monetization was not enforced:**
- `enforce` was `true` **only** for `k_*` slugs; every legacy-slug and
  no-subscription user (i.e. everyone today) got `enforce=false` → `hasCapability()`
  returned `true` → **full free access to all premium features.**
- Only **6/48 dashboard pages** and **7/136 API routes** actually called the gate.
  ~17 premium pages + ~26 premium routes were **accessible without payment**
  (knowledge brain, sales brain, revenue copilot/forecast, BI, command center,
  intel, funnel, leads, segments, analytics, coupons, recovery, working-hours,
  broadcasts page …).

This is pure **revenue leakage** for a product about to take paying customers, and
it was the single highest-leverage thing to fix.

## 2. Missing Features Added (this pass)

1. **Complete page-level gating** — 17 premium pages now `pageGate(cap)` →
   `<LockedFeature>` upgrade experience (was 6, now 23). Bilingual Arabic-first
   upsell copy per feature.
2. **Complete route-level gating** — 27 premium routes now `apiGate(cap)`
   defense-in-depth (was 7, now 34). Purely additive; existing RBAC/limits intact.
3. **A real Free tier** — `getEntitlements()` now enforces CORE-only capabilities
   for no-subscription / expired users, gated by `FREE_TIER_ENFORCEMENT`
   (default off, non-regressive). This is the mechanism that makes "nothing
   accidentally free" true for new sign-ups.
4. **Graceful premium degradation on core pages** — the cross-cutting AI
   `InsightStrip` (dashboard/customers/orders) now hides silently when not in plan,
   instead of showing an error. Customer-twin already degraded cleanly.

Everything else KEYONE needs for launch **already exists** — this pass intentionally
did NOT re-build working systems (per CLAUDE.md). Open feature work is triaged in §10.

## 3. Subscription Architecture

```
lib/pricing/catalog.ts ── single source of truth (TIERS + CAPABILITIES + limits)
        │                         │
        ▼                         ▼
prisma seed-plans (DB Plan rows)  components/pricing/FeatureMatrix (/pricing page)
        │                         (what customers are SOLD)
        ▼
DB Plan.featureFlags + limits
        │
        ▼
lib/membership/plan.ts  getEffectivePlan(userId)  → tier, limits, metaAccess, flags
        │
        ▼
lib/membership/entitlements.ts  getEntitlements() → capabilities{} + enforce
        │                                   │
        ▼                                   ▼
lib/membership/gate.ts            lib/membership/limits.ts
  pageGate(cap)  apiGate(cap)        checkLimit(messages|ai|broadcast)
        │                                   │
        ▼                                   ▼
<LockedFeature> / 402 paywall      LimitBanner / UpgradeModal
```
- **Money + runtime limits** live in DB `Plan` rows (admin-editable).
- **Capability ladder + marketing** live in the typed catalog (no migration).
- **Two generations coexist safely:** legacy slugs (existing subs, never enforced)
  and `k_*` public tiers (always enforced). Free tier = the fallback, now enforceable.
- **Boundaries respected:** WhatsApp send pipeline and the usage atomic-increment
  ledger were NOT touched.

## 4. Feature Gating Matrix
→ [`KEYONE_FEATURE_GATING_MATRIX_2026_06_10.md`](KEYONE_FEATURE_GATING_MATRIX_2026_06_10.md)
(authoritative page/route → capability → tier mapping, enforcement model, and the
list of intentional "core" exceptions with rationale).

## 5. Upgrade System
- **In-app discovery:** every locked premium page renders `<LockedFeature>` — lock
  icon, value prop, "Available on <Tier>" badge, and a CTA to `/pricing#plans`.
  No raw errors, no dead ends (matches the brief exactly).
- **Limit prompts:** `LimitBanner` + `UpgradeModal` (7 contextual variants with ROI
  copy) for message/broadcast/team/WhatsApp caps.
- **Conversion path:** `/pricing` (catalog-driven, industry matcher, yearly savings)
  → `UpgradeRequestPanel` on `/dashboard/usage` → admin `/admin/upgrade-requests`
  activates the subscription (+30/+365d, usage reset).
- **Gap:** no automated payment processor — upgrades are manual admin activation.
  Stripe/Paymob is a clean drop-in at the activation step (roadmap §10).

## 6. UX Improvements
- Premium surfaces now present a **consistent, branded upgrade experience** instead
  of silently working (which devalued the paid tiers) or, in one case, throwing a
  visible error (InsightStrip — fixed to hide gracefully).
- Locked-state copy is **specific and benefit-led** per feature (Arabic-first, RTL),
  not generic "upgrade required" noise.
- No core workflow was disrupted: inbox, orders, customers, products, settings,
  onboarding, store integrations and data export remain fully usable on every tier.

## 7. Business Improvements
- **Clear value ladder now enforced**, so each tier has a tangible reason to exist:
  Growth unlocks automation/broadcasts/team; Pro unlocks the entire intelligence &
  analytics suite (the product's biggest differentiator); Business unlocks
  multi-team/branches/approvals/reporting; Scale unlocks multi-number/API/custom
  integrations; Enterprise = white-label/SLA/dedicated.
- **What you sell = what you get:** marketing matrix and runtime gate share one
  catalog, so sales promises can't drift from product reality.

## 8. Revenue Improvements
- **Stops giving away the premium product.** Before: a free account could use Sales
  Brain, Revenue Copilot, BI, Knowledge Brain, segments, analytics — for $0. After:
  these require Pro+ and present an upgrade path.
- **Free tier as an acquisition funnel:** core WhatsApp + AI replies + orders stay
  free (great top-of-funnel), with constant, contextual nudges toward the value
  that sits one tier up.
- **The whole change is one switch away from live revenue:** `FREE_TIER_ENFORCEMENT=1`.

## 9. Production Readiness
| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `next build` (prisma generate + build) | ✅ success — 48 pages, 136 routes |
| `verify:rbac` | ✅ PASS — 136 routes, all mutating routes gated/waived |
| `verify:schema-parity` | ✅ PASS — 60 models SQLite ↔ Postgres |
| Change shape | ✅ additive only — 46 files, +391 / −3 |
| Protected systems | ✅ untouched — WhatsApp send pipeline, usage ledger |

## 10. Deployment Report & Go-Live Runbook

**Deploy (safe, non-regressive — nothing changes for current users):**
1. Merge this branch → standard build/deploy. With `FREE_TIER_ENFORCEMENT` unset/`0`,
   behavior is identical to today **except** premium surfaces are now gated for any
   user already on a `k_*` plan (the intended new-customer behavior).
2. Confirm the gates: log in as a `k_*` Start test user → premium pages show
   `<LockedFeature>`; core pages work.

**Turn on Free-tier revenue protection (the one go-live action):**
3. Verify no active paying customer would be locked out (must have a Subscription):
   ```sql
   -- expect 0 rows that are real paying customers
   SELECT u.id, u.email
   FROM User u
   LEFT JOIN Subscription s ON s.userId = u.id AND s.status = 'active'
   WHERE s.id IS NULL AND u.approvalStatus = 'approved';
   ```
4. Set **`FREE_TIER_ENFORCEMENT=1`** and restart. No-subscription/expired users now
   get the Free (core-only) tier with upgrade prompts. **Instant rollback:** set
   back to `0` — no deploy needed.

**Recommended immediate follow-ups (next sessions, prioritized):**
1. **Payment processor** (Stripe/Paymob) at the upgrade-activation step → remove the
   manual bottleneck before scaling past the first cohort.
2. **Differentiate Start vs Free** — today they share capability index 0. Give Start
   a concrete unlock (e.g. `broadcasts` lite, or `working_hours`) to justify $29.
3. **Activation funnel instrumentation** (already flagged in prior reports) — measure
   signup→connect→first-AI-reply→first-order to drive onboarding & upgrade timing.
4. **Wire the dormant self-learning loop** into follow-up priority (prior reports call
   this "trapped value", high ROI, low risk).
5. **Postgres cutover** before ~20–25 concurrent sessions (scale ceiling on SQLite).

**Hard constraints honored:** additive-only, no rewrite of working systems, WhatsApp
send pipeline untouched, billing atomic-increment ledger untouched, reports in
`project-knowledge`, full typecheck/build/regression run before sign-off.
