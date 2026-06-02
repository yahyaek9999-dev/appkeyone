# KEYONE — Growth & Conversion Suite · Phase 1 Delivery Report

**Date:** 2026-06-02
**Status:** ✅ Shipped to production (`https://app.keyone1.com`, build `f091d27`)
**Rollout:** Phased (your choice). **Phase 1 = 5 additive features shipped now.** **Phase 2 = Team Roles & Permissions (RBAC)** + the team-coupled inbox bits, deferred to a focused, carefully-scoped build (see §7).

> Why phased: RBAC is architecturally invasive — today KEYONE is strictly **1 `User` = 1 account** and every query scopes by `getUserId()`. Sharing the owner's data with team members needs an `effectiveUserId` indirection that touches auth broadly, which conflicts with the "don't break production" rule. The other 5 features are cleanly additive, so they ship first.

---

## 1. Features shipped (Phase 1)

### ① Live Team Inbox / Human Takeover
- **Take Over / Return to AI** in the conversation header (relabeled the existing handoff control — same battle-tested `pause` path: `human_active` ⇄ `ai_active`). AI pause/resume is already enforced by the incoming gate, so no hot-path change.
- **Handoff status badge** in the header: AI نشط / تدخل بشري / تصعيد / بانتظار البشر (maps `Conversation.handoffState`).
- **Quick-assign** in the inbox sidebar (reuses the CRM `assign` action → `Customer.assignedAdmin`).
- **Internal team-notes thread** (admin-only, never sent to the customer) — new `ConversationNote` model + `/api/inbox/conversation/[id]/internal-notes` (GET/POST). **@mentions are parsed & highlighted** (routing/notification is Phase 2).

### ② Product Catalog inside WhatsApp
- `Product` model + `/dashboard/products` (premium CRUD cards: image, price, compare-at, stock, category, description, link, show/hide) + `/api/products` (+`[id]`).
- **AI product cards:** `detectCatalogIntent()` (lib/sales-engine) fires on "عاوز المنتجات / ابعتلي الأسعار / ايه المتاح / الكتالوج…" → `lib/catalog/cards.ts` builds a deterministic card block (image link + name + price + short desc + link) appended to the reply. **Append-only, gated, at the final reply return** — normal replies are byte-for-byte unchanged.

### ③ Coupon / Discount Engine
- `Coupon` + `CouponRedemption` models + `/dashboard/coupons` (percent/fixed, expiry, usage-limit, one-time, auto-offer toggle) + `/api/coupons` (+`[id]`, +`[id]/redeem`).
- **`/redeem` enforces** expiry / usage-limit / one-time-per-customer and records attributed revenue.
- **AI dynamic offer:** on price/discount signals from a non-buyer, the bot appends an active `autoOffer` coupon (bumps `offeredCount`) — gated, append-only.
- **Tracking:** offered / used / revenue / conversion %, shown per coupon.

### ④ Shipping Tracking Automation
- Added `packed` + `returned` statuses; added courier + tracking-URL fields to the order editor.
- `lib/shipping/notify.ts` sends the customer a WhatsApp update on **each** status change (preparing/packed/shipped/out_for_delivery/delivered/cancelled/returned) with built-in Arabic templates (overridable via `Bot.shippingTemplates`). **Through the protected queue** (`wa.send` → outgoing-queue). Gated by `Bot.orderStatusNotifyEnabled` (**OFF by default → existing accounts unaffected**); skips `shipped` if the legacy `shipmentNotifyEnabled` owns it (no double-send). Toggle added to Bot settings.

### ⑤ Daily Owner WhatsApp Digest (enriched)
- The existing daily digest now includes a **"نظرة الأعمال"** block: best-seller, conversations awaiting reply, customers needing follow-up, at-risk customers, top-converting recent campaign, and **low-stock alerts** — each line renders only when it carries signal. `lib/daily-report/extras.ts` composes it from existing engines; the cron + delivery send path is unchanged.

---

## 2. Files changed

**New models** (`prisma/schema.prisma`): `Product`, `Coupon`, `CouponRedemption`, `ConversationNote` (+ additive `Bot.shippingTemplates`, `Order.courierName`).

**New files:**
- API: `app/api/products/{route,[id]/route}.ts`, `app/api/coupons/{route,[id]/route,[id]/redeem/route}.ts`, `app/api/inbox/conversation/[customerId]/internal-notes/route.ts`
- Pages: `app/dashboard/products/{page,products-ui}.tsx`, `app/dashboard/coupons/{page,coupons-ui}.tsx`
- Libs: `lib/catalog/cards.ts`, `lib/shipping/notify.ts`, `lib/daily-report/extras.ts`

**Edited (additive only):** `app/dashboard/inbox/inbox-ui.tsx` (takeover labels, handoff badge, assign, notes thread), `app/api/inbox/conversation/[customerId]/route.ts` (+assignedAdmin), `app/api/whatsapp/incoming/route.ts` (gated final-return append), `lib/sales-engine.ts` (+detectCatalogIntent), `app/api/orders/[id]/route.ts` (+packed/returned, +courier, +shipping notifier), `app/dashboard/orders/[id]/{order-actions,page}.tsx` (statuses + tracking fields), `app/api/bot/route.ts` + `app/dashboard/bot/bot-form.tsx` (shipping toggle), `lib/daily-report/format-ar.ts` + `app/api/cron/daily-report/route.ts` (extras), `app/dashboard/nav-items.tsx` (+المنتجات, +الكوبونات).

---

## 3. Schema changes
Additive, nullable/defaults → **non-destructive `prisma db push`** (production: *"now in sync … Done in 647ms"*). 4 new tables + 2 new columns; no existing model's relations changed (new tables use scalar `userId`/`conversationId` + index, like `SafetyAudit`).

---

## 4. Deploy result
Single deploy via `./deploy.sh`: push → VPS build **succeeded** (all 6 new routes + 2 pages compiled) → `prisma db push` additive sync → service **SERVICE_RUNNING**. Live build `f091d27-20260602`.

---

## 5. Verification

### Pre-deploy
- ✅ `tsc --noEmit` exit 0; ✅ `npm run build` compiled successfully.
- ✅ **Headless E2E** (seeded products/coupons/order, minted session):
  - Products list/create ✅; Coupons list+tracking ✅; **redeem SAVE20 → ok; second redeem same customer → blocked (one-time enforced)** ✅.
  - Internal-notes add/list ✅, **@mention "منى" extracted** ✅.
  - Order PATCH → `packed` (+courier "أرامكس") → **`reminder_sent` timeline entry = shipping update enqueued through the queue** ✅; PATCH → `returned` accepted ✅.
  - Daily digest dry-run rendered the enriched **"نظرة الأعمال"**: best-seller, at-risk (9), **low-stock alert (حذاء رياضي، ساعة يد)** ✅.
- ✅ Regression (local, authed): inbox / broadcasts / orders / funnel / segments / Customer-360 all 200.
- ✅ Protected send pipeline, queue, billing, subscriptions, broadcast worker = git-confirmed untouched (only `incoming/route.ts` edited — append-only hook).

### Post-deploy (production)
| Check | Result |
|------|--------|
| `/api/health` version | **f091d27-20260602**, status ok |
| existing inbox/broadcasts/orders/whatsapp/funnel (unauth) | **401** (no regression) |
| `/dashboard/products`, `/dashboard/coupons` (unauth) | **307 → login** |
| `/api/products`, `/api/coupons`, `/api/coupons/:id/redeem`, internal-notes (unauth) | **401** (deployed + gated) |

### ⚠️ Not verified live (honest gaps)
- The **AI product-cards / coupon append inside a real WhatsApp conversation** was verified by build + the underlying data/intent logic, but **not driven through the live WhatsApp session** (no WA service in the local env). Recommended 1-min live check: from the test phone, send **"عاوز المنتجات"** → expect the reply + product cards; and a price-objection message → expect the `SAVE20` offer.
- **Shipping customer message delivery**: the enqueue path is verified end-to-end; actually delivering to a customer needs a live status change on a real order with `Bot.orderStatusNotifyEnabled` turned on. (Also note: media AI / `OPENAI_API_KEY` from the last QA is still unset — unrelated, but product images sent as links still preview fine.)

---

## 6. Safety upheld
- 100% additive. **Untouched:** WhatsApp send pipeline, queue, billing, subscriptions, CRM, Customer 360 data, orders core, broadcast send, analytics/AI-sales engines.
- Incoming-route change is a **single gated, append-only block at the final success return**, wrapped in try/catch (enrichment can never break a reply).
- All new outbound (shipping/coupon/cards) goes through the **protected queue**; shipping is OFF by default.

---

## 7. Phase 2 plan (Team Roles & Permissions) — next focused build
- `TeamMember` model (ownerUserId ↔ memberUserId + role: Owner/Admin/Sales/Support/Viewer + status) + invite (owner-created credentials) / remove / change-role / disable.
- `lib/team.ts resolveEffectiveUser()` → `effectiveUserId` indirection adopted on the **operational surfaces** the role matrix needs (inbox, customers, orders, analytics, broadcasts) + **role-gated nav** so members only see permitted pages. Owner login/data 100% unchanged.
- Then the team-coupled inbox bits: **@mention routing/notifications** and **per-admin unread counts** (`ConversationRead`).

## 8. Future opportunities
- Coupon → order **auto-attribution** (link a redemption to the converting order automatically) + low-stock auto-restock-reminder.
- Product cards: category-aware filtering + carousel media send (when media AI/key is enabled).
- Per-status shipping template editor UI (currently JSON/default); courier tracking deep-links per provider.
