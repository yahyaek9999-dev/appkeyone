# KEYONE — AI Sales Operating System · Delivery Report

**Date:** 2026-06-01
**Status:** ✅ Shipped to production (`https://app.keyone1.com`)
**Scope:** 4 additive modules turning KEYONE from AI support into an AI Sales OS. No existing stable system was rewritten or touched.

---

## 1. Features shipped

### Module 1 — Funnel Conversion Dashboard (`/dashboard/funnel`)
A cohort funnel of contacts acquired in the window, rendered as descending gradient stage bars with conversion + drop-off between each stage:
**Visitors → Conversations Started → Leads → Qualified Leads → Orders Created → Paid Orders → Repeat Customers** (guaranteed monotonic — score stages are nested subsets and placing an order proves intent).
KPIs: overall conversion %, close rate, repeat-purchase %, avg first-response time, avg time-to-close. Insight cards: top converting channel, top converting product, top losing stage. Day-range filter (7/30/90).

### Module 2 — Advanced Broadcast AI (extends `/dashboard/broadcasts`)
- **AI Optimize panel** (`/api/broadcasts/optimize`): best send time (from real inbound-activity histogram), ideal message length verdict, 3 click-to-insert CTA options (LLM via the merchant's provider, graceful fallback), best segment to target (highest historical conversion), follow-up timing, and an expected-conversion estimate with its basis.
- **A/B testing** (`/api/broadcasts/ab` create + `/api/broadcasts/ab/[groupId]` compare): writes **two linked campaigns** (A/B) and splits the audience 50/50, both draining through the **unchanged** send pipeline. The list shows an "A/B · variant" badge and a "نتيجة A/B" panel comparing replies/conversions and crowning a winner (only once both variants have sent).

### Module 3 — Customer Segmentation AI (`/dashboard/segments`)
Auto-clusters customers into 9 smart segments — VIP Buyers, Repeat Buyers, High-Intent Leads, Likely to Buy Again, Abandoned Cart, Discount Hunters, At-Risk, Cold Leads, Ghost Customers. Each card shows count, total revenue, AOV, last activity, conversion %, and a suggested action. Admin can **open/filter** a segment (member list) and **broadcast to segment** (composer → reuses the protected broadcast pipeline via a new additive `audience: "segment:<key>"` branch).

### Module 4 — Revenue Forecast AI (`/dashboard/revenue-forecast`)
Forecasts next-7-day sales, next-30-day revenue, expected orders, returning-customers %, highest-revenue day, and low-sales warning days using a pure-JS linear trend + day-of-week seasonality model (no new deps). Premium SVG chart: solid actual line → dashed forecast line with a "today" divider. Plus **Daily Business Insights** (what's growing/dropping, best products, customers needing follow-up, recommended action today) composed from existing aggregates.

---

## 2. Files changed

### New backend libs (read-only, reusable)
| File | Purpose |
|------|---------|
| `lib/analytics/order-rollup.ts` | **Foundation.** Derives per-customer order facts (orders, paid, revenue, first/last) from the Order table. Fixes the unmaintained-counter landmine; reused by all modules. |
| `lib/analytics/funnel.ts` | `computeFunnel(userId, days)` — stages, conversions, metrics, top channel/product/losing-stage. |
| `lib/analytics/segments.ts` | `computeSegments()` + `resolveSegmentCustomers()` — 9 segments + broadcast resolver. |
| `lib/analytics/forecast.ts` | `computeForecast()` — trend+seasonality forecast + daily insights. |
| `lib/broadcasts/ai-optimize.ts` | `optimizeCampaign()` — data-driven suggestions + 1 LLM CTA call. |
| `lib/broadcasts/analytics.ts` | `computeBroadcastAnalytics()` — reusable per-campaign metrics (used by A/B compare; existing analytics route untouched). |

### New API routes (all `getUserId`-scoped, `force-dynamic`)
`app/api/funnel/route.ts`, `app/api/segments/route.ts`, `app/api/revenue-forecast/route.ts`, `app/api/broadcasts/optimize/route.ts`, `app/api/broadcasts/ab/route.ts`, `app/api/broadcasts/ab/[groupId]/route.ts`

### New pages (server page + client UI each)
`app/dashboard/funnel/{page,funnel-ui}.tsx`, `app/dashboard/segments/{page,segments-ui}.tsx`, `app/dashboard/revenue-forecast/{page,forecast-ui}.tsx`

### Modified (additive only)
| File | Change |
|------|--------|
| `app/api/broadcasts/route.ts` | Added a branch: `audience: "segment:<key>"` resolves recipients via the segmentation engine. Every other path unchanged. |
| `app/dashboard/broadcasts/broadcasts-ui.tsx` | Added: mode tabs (normal/A/B), AI Optimize panel, Version-B textarea, and the A/B winner comparison panel. Existing form/list/send logic untouched. |
| `app/dashboard/nav-items.tsx` | +3 nav links (مسار البيع, شرائح العملاء, توقّع الإيرادات). |
| `prisma/schema.prisma` | +`Broadcast.abGroupId`, `Broadcast.abVariant` (nullable) + index. Non-destructive. |

### Reused (no edits)
`lib/retention-engine` (`classifyLifecycle`, churn/loyalty), `lib/conversion-engine`, `lib/daily-report/aggregate` (`aggregateForUser`), `lib/sales-brain/revenue` (`revenueIntelligence`), `lib/intel/follow-up-ops` (`detectFollowUpOps`), `lib/llm` (`chat`) + `botProviderOverride`, `lib/broadcasts/audience` (`buildAudienceWhere`), UI primitives + design-system CSS.

---

## 3. Pages added
- `/dashboard/funnel` — مسار البيع
- `/dashboard/segments` — شرائح العملاء
- `/dashboard/revenue-forecast` — توقّع الإيرادات

(Build-confirmed: funnel 4.41 kB, revenue-forecast 4.49 kB, segments 5.43 kB.)

---

## 4. Deploy result
Single deploy via `./deploy.sh`: commit → push `origin/main` → VPS pull/stop/`npm ci`/`npm run build`/`prisma db push --skip-generate`/restart.
- VPS build: **succeeded** (all 6 new API routes + 3 pages compiled).
- Schema sync: **"Your database is now in sync with your Prisma schema. Done in 256ms"** — additive A/B columns, non-destructive, no data-loss prompt.
- Service after restart: **SERVICE_RUNNING**.

---

## 5. Verification

### Pre-deploy (local)
- ✅ `tsc --noEmit` exit 0; ✅ `npm run build` compiled successfully.
- ✅ **Headless E2E** (18 seeded customers, 15 orders across 30 days, 86 messages; minted session):
  - `/api/funnel` → stages **19 ≥ 19 ≥ 15 ≥ 14 ≥ 8 ≥ 6 ≥ 4 (monotonic)**, close 42.9%, repeat 50%, real top channel/product/losing-stage.
  - `/api/segments` → 9 segments with correct counts/revenue/AOV/conversion (VIP 4 @ 75%, Repeat 4 @ 100% …); member list resolves.
  - `/api/revenue-forecast` → 30 history + 14 forecast points, next7/next30, returning 50%, growth %, peak day, 5 low-sales days, 3 insights.
  - `/api/broadcasts/optimize` → real send-time histogram + best segment + expected conversion; CTA fallback when LLM offline.
  - `/api/broadcasts/ab` → 2 linked broadcasts split 10/9; `/ab/[groupId]` compares + winner guard (undecided until sent).
  - `audience:"segment:<key>"` create → resolved recipients through the normal pipeline.

### Post-deploy (production · `https://app.keyone1.com`)
| Check | Result |
|-------|--------|
| `/api/health`, `/login` | **200 / 200** |
| existing `/api/inbox/conversations`, `/api/broadcasts`, `/api/whatsapp/status` (unauth) | **401** (no regression — responding, gated) |
| `/dashboard/{funnel,segments,revenue-forecast}` (unauth) | **307 → login** |
| all 6 new API routes (unauth) | **401** (deployed + gated) |

---

## 6. Safety
- 100% additive. **Untouched:** WhatsApp send (`lib/wa.ts`), broadcast send pipeline (`app/api/cron/broadcasts`, `workers/broadcast.worker.ts`), queue, billing/subscriptions, media, Customer 360, orders, CRM, protection engine (git-confirmed: none of these files changed).
- A/B reuses the existing send pipeline unchanged (two ordinary broadcasts). Segment broadcasts reuse the existing create→queue path.
- Additive nullable schema only → non-destructive `prisma db push`.
- New reads are bounded (groupBy + capped scans + parallelized); one bounded LLM call only in `/optimize` (CTA suggestions), graceful fallback.

---

## 7. Future opportunities
- **Unbreak the legacy counters:** maintain `Customer.orderCount`/`totalOrderValue`/`lastOrderAt` on the order write-path so `revenueIntelligence` and the `buyers` broadcast audience stop reading 0 (deferred here to avoid changing live scoring-engine inputs).
- **True top-of-funnel:** capture web/profile-visit events for a real "Visitors" stage (today it's unique WhatsApp contacts).
- **A/B auto-promotion:** auto-send the winning variant to the remaining audience, and早-stop on significance.
- **Forecast upgrade:** confidence bands + holiday/seasonality calendar; per-product and per-segment forecasts.
- **Segment automation:** scheduled "at-risk" recovery and "likely-again" upsell campaigns triggered when a customer enters a segment.
- **Persisted optimize insights** per campaign for before/after learning.
