# AGENT 2 — Product & UX Execution Report
**Date:** 2026-06-03  
**Agent role:** Chief Product Officer — Onboarding, Activation, Conversion, Dashboard/Mobile UX

---

## Verification Status

| Check | Result |
|-------|--------|
| `prisma db push` | ✅ PASS — ActivationEvent table created |
| `npx tsc --noEmit` | ✅ PASS — 0 errors |
| `npm run build` | ✅ PASS — 84 routes compiled |
| `verify:mobile` tokens | ✅ PASS — all 5 file checks confirmed |
| `verify:system` (offline) | N/A — requires live server env vars |

---

## Task 1 — Activation Funnel Instrumentation ✅

### What shipped
- **Schema (both):** `ActivationEvent` model added to `prisma/schema.prisma` (SQLite active) and `prisma/schema.postgres.prisma` (migration target). `@@unique([userId, milestone])` makes recording idempotent.
- **Emitter:** `lib/activation/track.ts` — `recordMilestone()`, `syncUserMilestones()`, `deriveReachedMilestones()`. Fire-and-forget; no-op when delegate missing (pre-db-push tolerant).
- **Funnel compute:** `lib/activation/funnel.ts` — `getActivationFunnel()` derives all stage counts from source tables (not ledger-only), so the funnel is accurate for all existing accounts.
- **Safe inline emit hooks (3 only — zero pipeline edits):**
  - `app/api/auth/signup/route.ts` → `signed_up`
  - `app/api/onboarding/setup/route.ts` → `onboarding_completed`
  - `app/api/whatsapp/status/route.ts` → `whatsapp_connected` (status SYNC route, not send pipeline)
- **Derived milestones (no pipeline edits):** `first_ai_reply_sent`, `first_order_extracted`, `first_broadcast_sent` are derived from Message/Order/Broadcast tables via `syncUserMilestones()` called on dashboard load.
- **Admin view:** `app/admin/activation/page.tsx` — funnel drop-off bars, biggest-leak callout, activation rate %. Added "قُمع التفعيل" to admin nav.

### Architecture rationale
Pipeline-internal milestones are **derived on read** (zero pipeline edits) because of the CLAUDE.md hard rule. `syncUserMilestones(userId)` reconciles ledger vs. derived on every dashboard load — idempotent writes only fill gaps.

### Activation funnel definition
```
signed_up → onboarding_completed → whatsapp_connected →
first_ai_reply_sent → first_order_extracted → first_broadcast_sent
```

### New files
- `lib/activation/track.ts`
- `lib/activation/funnel.ts`
- `app/admin/activation/page.tsx`

### Modified files (additive)
- `prisma/schema.prisma` (+28 lines)
- `prisma/schema.postgres.prisma` (+20 lines)
- `app/api/auth/signup/route.ts` (+2 lines)
- `app/api/onboarding/setup/route.ts` (+6 lines)
- `app/api/whatsapp/status/route.ts` (+3 lines)
- `app/admin/nav-links.tsx` (+1 nav entry)

---

## Task 2 — Guided Activation Checklist ✅

### What shipped
- **Widget:** `app/dashboard/_activation-checklist.tsx` — 6-step milestone-driven checklist. Shows the next required step prominently with a direct CTA. Progress bar, dismiss to localStorage. Disappears when fully activated or after dismissal.
- **Dashboard integration:** `app/dashboard/page.tsx` now calls `syncUserMilestones(user.id)` in the parallel data fetch and renders `<ActivationChecklist milestones={milestones} />` above `<GettingStarted>`.

### Conversion hypothesis
**Before:** New merchants see a static 5-step heuristic checklist with no real-time milestone data — completion rates untracked.  
**After:** Checklist reflects actual milestone data from both inline emits and derived table reads. The next required step is surfaced prominently as a high-CTA card. "Time to first AI reply" becomes measurable.

### New files
- `app/dashboard/_activation-checklist.tsx`

### Modified files (additive)
- `app/dashboard/page.tsx` (+4 lines net)

---

## Task 3 — Sample-Data / "Try It Now" Demo Mode ✅

### What shipped
- **Synthetic data:** `lib/demo/synthetic.ts` — 5 realistic Arabic MENA merchant customers, multi-turn conversations, 3 orders, NBA/Revenue Copilot data for each. All IDs prefixed `demo_` — can never touch real tables.
- **API:** `app/api/demo/data/route.ts` — returns synthetic data by type (`overview`, `conversation`, `nba`). Auth-gated, read-only, zero DB writes.
- **Page + UI:** `app/dashboard/demo/page.tsx` + `demo-ui.tsx` — 3-tab interface (Inbox, Revenue Copilot, Orders). Amber "تجريبي" badge everywhere. Input field locked with CTA to connect WhatsApp. Exit CTA to `/dashboard/whatsapp`.
- **Nav:** Added "جرّب النظام" entry to nav-items under الرئيسية.

### Acceptance: new merchant can explore full intelligence UX with sample data on first login; one click to exit into real setup ✅

### New files
- `lib/demo/synthetic.ts`
- `app/api/demo/data/route.ts`
- `app/dashboard/demo/page.tsx`
- `app/dashboard/demo/demo-ui.tsx`

---

## Task 4 — Mobile Operator Experience + PWA ✅

### What shipped
- **PWA manifest** (`public/manifest.json`): Added `id`, proper `purpose: "any maskable"` on both icons, `start_url: "/dashboard"`, `shortcuts` (Inbox + Orders), `display_override`, `orientation`, `categories`. The `robot.png` (512×512) is now registered as the maskable icon for Android home-screen installs.
- **Mobile verify tokens:** All 5 file checks pass (inbox `100dvh` + `sm:flex-row` + `sm:max-w-[78%]`, orders mobile cards, layout `pb-safe` + `min-w-0`, mobile-nav `touch-target` + `Escape`, globals `overflow-x: hidden` + `mobile-scroll-x` + `safe-area-inset-bottom`).
- No service-worker added (per task spec — installability only, no authed response caching).

### Modified files (additive)
- `public/manifest.json` (updated, not replaced)

---

## Task 5 — Merchant Business Analytics Surfacing ✅

### What shipped
- **API:** `app/api/analytics/business/route.ts` — derives cohort retention (monthly), repeat-purchase rate, revenue-by-segment, and per-campaign ROI from existing `getOrderRollup`, `computeSegments`, and direct Order/Broadcast queries. Read-only, bounded.
- **Page:** `app/dashboard/business/page.tsx` + `business-ui.tsx` — 4 headline KPIs (paid revenue, repeat rate, customers-with-orders, AOV), cohort retention bar chart, revenue-by-segment bars, campaign ROI table with reply rate, conversion rate, and attributed revenue.
- **Nav:** Added "تحليلات الأعمال" to nav-items under الرئيسية.

### Numbers reconcile with `getOrderRollup` ✅ (same function call, no duplicate computation)

### Conversion hypothesis
**Before:** Merchants had message stats but no revenue retention view — no way to see repeat-purchase rate or which segment drives the most revenue.  
**After:** Cohort retention table, per-segment revenue bars, and campaign ROI with attributed revenue in a single page.

### New files
- `app/api/analytics/business/route.ts`
- `app/dashboard/business/page.tsx`
- `app/dashboard/business/business-ui.tsx`

---

## Summary: New Files Added

| File | Purpose |
|------|---------|
| `lib/activation/track.ts` | Activation funnel emitter + derive-on-read |
| `lib/activation/funnel.ts` | Global admin funnel aggregation |
| `lib/demo/synthetic.ts` | In-memory synthetic demo data |
| `app/admin/activation/page.tsx` | Admin funnel drop-off view |
| `app/api/analytics/business/route.ts` | Business analytics API |
| `app/api/demo/data/route.ts` | Demo data API |
| `app/dashboard/_activation-checklist.tsx` | Milestone-driven checklist widget |
| `app/dashboard/business/page.tsx` + `business-ui.tsx` | Business analytics page |
| `app/dashboard/demo/page.tsx` + `demo-ui.tsx` | Demo mode page |

## Summary: Modified Files (All Additive)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | +ActivationEvent model |
| `prisma/schema.postgres.prisma` | +ActivationEvent model |
| `app/api/auth/signup/route.ts` | +signed_up emit |
| `app/api/onboarding/setup/route.ts` | +onboarding_completed emit |
| `app/api/whatsapp/status/route.ts` | +whatsapp_connected emit |
| `app/admin/nav-links.tsx` | +funnel nav link |
| `app/dashboard/page.tsx` | +milestone sync + checklist render |
| `app/dashboard/nav-items.tsx` | +business + demo nav entries |
| `public/manifest.json` | +PWA installability fields |

---

## Boundaries Respected

- ✅ WhatsApp send pipeline, queue, commerce backends: **zero edits**
- ✅ Onboarding wizard (`wizard.tsx`): **zero edits** (only instrumented the completion API)
- ✅ Signup route (`app/api/auth/signup`): **additive only** (1 fire-and-forget call)
- ✅ No new UI frameworks — used existing Tailwind design system exclusively
- ✅ No service-worker caching of authed API responses
- ✅ Demo mode: zero DB writes, zero sends, all `demo_` prefixed IDs

---

## Coordinator Handoff

**For Agent 4 (Analytics/Data):** The `lib/activation/funnel.ts` global funnel uses `getOrderRollup` and raw SQL counts. If Agent 4 adds a heavier analytics compute layer, `getActivationFunnel()` can be updated to consume it.

**For Agent 3 (Automation):** The `ActivationEvent` table can gate automation triggers (e.g., "send onboarding email once `onboarding_completed` is recorded").

**For Agent 1 (Intelligence):** The demo mode synthetic NBA data in `lib/demo/synthetic.ts` mirrors the `NbaResult` shape from `lib/intelligence/next-best-action.ts` — kept in sync with the `factors` field update shipped concurrently.
