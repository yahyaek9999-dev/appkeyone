# UI Dense-State QA — Phase 8

**Date:** 2026-09-03
**Branch:** `claude/domain-migration-inventory-b12e5a`
**Tenant:** local UI Test Merchant (`test@wkeyone.com`), local sqlite dev.db only.

## Synthetic dataset created (LOCAL, test-only)

Additive Prisma inserts for the test tenant: 24 customers (varied lead score / intent / sentiment / recency, 2 archived, some VIP); 14 conversations with 2–8 messages each (some flagged, human_active mix); 18 orders across all 8 statuses spanning ~12 days; 12 products (varied price, out-of-stock, categories, compare-at); 5 broadcasts (done/sending/queued/scheduled with progress); 6 automation rules (enabled/disabled, varied trigger→action); 6 quick replies; 5 knowledge docs (manual/faq/products). All clearly synthetic Arabic data.

**Money-unit correction:** first seed assumed cents; the app convention is **whole EGP** (see finding #2), so order totals + product prices were normalized to whole EGP for valid QA.

## Dense-state findings & changes

**1. Dashboard recent-orders status — MEANINGFUL FIX (committed `3d02d1f`).**
Dense data exposed the dashboard's local `OrderStatusChip` map omitting `preparing/packed/out_for_delivery/returned` → raw English leaked into the Arabic UI (e.g. "preparing"). Replaced with the canonical `components/ui/order-status-pill.tsx` (full status coverage, icons, consistent ring styling); removed the duplicate local map. Verified desktop + 375px (no overflow), typecheck clean.

**2. Revenue under-reported 100× — FLAGGED, not silently changed (task `task_414ec246`).**
The app stores money in **whole EGP** everywhere (`fmtMoney` no /100; `Product.price` raw; `lib/order-extractor.ts` uses raw spoken price; `lib/commerce/catalog-sync.ts` `Math.round(price)` raw; orders rows + order detail raw). But `app/dashboard/page.tsx` revenue KPI and `app/dashboard/orders/page.tsx:102` revenue summary divide by 100 → they under-report real revenue 100×. Money/revenue-figure sensitive and the correct alignment deserves explicit review, so it was raised as a focused task with full evidence rather than edited mid-phase.

## Surface verdicts (State → Verdict)

| Surface | State | Verdict |
|---------|-------|---------|
| Dashboard | Dense | **Meaningful improvement made** (status-pill unification). Attention queue, opportunity signals, metric band, trend, recent-work all strong with data. |
| Inbox | Dense | Excellent — conversation list (avatars, unread dots, previews, lead badges) + thread pane (in/out bubbles, lead score, 360/takeover) scan well. |
| Customers | Dense | Excellent — Attio-style CRM rows (name + last-message preview + phone + activity + count + hover action) confirmed via DOM. |
| Orders | Dense | Excellent (UI) — filter tabs w/ counts, `OrderStatusPill`, export. (Money display = finding #2.) Product column shows "—" only because seed had no line items. |
| Products | Dense | Excellent — realistic prices, compare-at strikethrough, out-of-stock badges, category tags, clean grid + actions. |
| Broadcasts | Dense | Excellent — campaign cards w/ status, progress bars, scheduled dates, contextual per-status actions. |
| Automation | Both | Excellent — smart-rules list (name + enabled badge + trigger→action + fire count); commerce section empty-state fine. |
| Analytics | Both | Excellent — KPI band, populated daily line chart, top-tags, lead-score distribution. Sentiment/intent cards show correct per-card empty states (message-level source not seeded). |
| Knowledge | Dense | Excellent — training-status stats, source-breakdown badges, doc cards w/ previews + usage counts. |
| Quick Replies | Dense | Excellent — trigger badges, replies, usage counts, per-row actions (Phase 6 migration holds densely). |
| Settings | Populated | Excellent — identity card, subscription/personal cards, usage bar, deep nav. |
| Landing / Login | Static | Excellent (verified Phase 7 desktop + 375px). Aveiro is a content-site builder; its docs/blog/portfolio templates offer nothing over the existing premium 14-section hero — no change warranted. |

## Verification
- Desktop: all 11 app surfaces inspected with dense data.
- 375px: dashboard (changed surface) verified — no horizontal overflow; landing verified in P7.
- Console: no new errors observed during QA.
- TypeScript: clean (only the 5 pre-existing admin `mode` errors).
- Commits: `3d02d1f` (dashboard status pill). No other source changed — remaining surfaces were genuinely excellent in dense state.

## Remaining gaps (not addressed here)
- Revenue 100× display (`task_414ec246`) — money-sensitive, owner review.
- Analytics sentiment/intent read from a message-level classification source not covered by the synthetic seed (data gap, not a UI defect).
- Order line items not seeded → Orders "المنتج" column shows "—" (seed gap, not a UI defect).
- Secondary sub-surfaces (escalations, my-work, leads, shipments, developer/white-label settings) not individually dense-audited.
