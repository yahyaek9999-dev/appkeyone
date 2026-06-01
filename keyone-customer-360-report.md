# KEYONE — Customer 360 CRM Profile · Delivery Report

**Date:** 2026-06-01
**Status:** ✅ Shipped to production (`https://app.keyone1.com`)
**Scope:** One high-value feature, additive only. No existing inbox/chat/realtime/queue/billing logic was rewritten.

---

## 1. What was built

When an admin opens any conversation in the inbox, a **"ملف 360"** button (in the
chat header and the desktop info sidebar) opens a premium glass **slide-over
panel** with the full intelligent customer profile — facts, AI intelligence,
a unified activity timeline, and admin controls. Full-width on mobile,
~460px on desktop, RTL, opened/closed without ever disturbing the chat view.

The AI intelligence scores are **already computed** by the existing
conversion/retention/sentiment engines and stored on the `Customer` row. The
profile **reads and displays** them — it never recomputes and never touches the
scoring engines.

---

## 2. Files changed

### New files
| File | Purpose |
|------|---------|
| `saas/app/api/customers/[id]/timeline/route.ts` | GET — bounded, read-only unified activity timeline (messages, orders, order events, escalations, follow-ups, broadcasts), merged + sorted newest→oldest. |
| `saas/app/api/customers/[id]/crm/route.ts` | POST — consolidated admin-controls endpoint (note, tags, VIP, blacklist, assign, archive, force-escalate, manual order). userId-scoped action switch. |
| `saas/app/dashboard/inbox/customer-360.tsx` | The slide-over drawer + all cards (identity, intelligence, key facts, tags, notes, controls, timeline). |

### Modified files
| File | Change |
|------|--------|
| `saas/app/api/customers/[id]/profile/route.ts` | Order stats now aggregated from the `Order` table (see note below). Profile facts + intelligence mapping otherwise unchanged. |
| `saas/app/dashboard/inbox/inbox-ui.tsx` | Minimal additive wiring only: import drawer, one `profileOpen` state, a header button, a sidebar button, and the `<Customer360 />` render. No changes to polling, realtime, send, pause, or message rendering. |
| `saas/prisma/schema.prisma` | Additive nullable/default `Customer` fields: `vip`, `blacklisted`, `archivedAt`, `assignedAdmin`, `photoUrl`. Non-destructive — existing rows unaffected. |

### Reused (no edits) — kept the feature safe and DRY
- `lib/escalation.ts` → `createEscalationTicket()` powers **force-escalation** (same path the AI uses; pauses the bot for human takeover).
- `app/api/recovery/action.ts` → **manual follow-ups** are sent through this existing endpoint, which drains the **protected outgoing/broadcast queue** (pacing / anti-flood / cooldown). Nothing bypasses the safety layer — no direct WhatsApp send was added.
- `lib/db`, `lib/auth` (`getUserId`), `lib/phone` (`formatCustomerPhone`), `components/ui/avatar`, and the existing design-system classes (`card`, `surface`, `chip`, `ai-btn-*`, `input`, brand-green glass).

### ⚠️ Notable correctness fix
The denormalized counters `Customer.orderCount` / `totalOrderValue` / `lastOrderAt`
are **never written anywhere in the codebase** — they are always `0`/`null`. The
original profile endpoint trusted them, so it would have shown **"0 orders /
0 spent" for real buyers**. The profile now computes order count, total spent,
and AOV via a single bounded `prisma.order.aggregate` (excluding canceled
orders). Message counters (`inboundCount`/`outboundCount`) are correct as-is —
they are maintained by `lib/safety/trust.ts`.

---

## 3. Features added (mapped to the request)

**1. Customer 360 Profile View** — name, WhatsApp number, profile photo
(falls back to initials avatar), first contact date, last message date, total /
inbound / outbound messages, total orders, total spent, AOV, last ordered
product, last order status, last payment method, city/address, preferred
language, tags, admin notes, assigned admin.

**2. AI Customer Intelligence Layer** — clean score cards for: Hot/Warm/Cold
lead (with score bar), purchase intent, conversion chance, repeat-buyer
probability, churn risk, retention/loyalty, negotiation tendency, plus last
sentiment & last intent pills. (All read from existing engine outputs.)

**3. Customer Timeline** — unified, newest→oldest feed of messages, orders,
order status/payment events, escalations (opened + resolved), follow-ups sent,
and broadcasts received. Each source query is independently capped for speed.

**4. Admin Controls** — add/edit note, add/remove tag, mark/clear VIP,
mark/clear blacklist, assign to staff, archive/unarchive, create manual order
(inline multi-item form with live total), send manual follow-up (via protected
queue), force escalation.

**5. UI / UX** — premium glass cards, strong spacing, elegant hover/active
states, RTL, mobile-friendly slide-over, lazy timeline for fast open, reuses the
existing design system. No new npm packages added.

**6. Safety** — see below.

---

## 4. Safety guarantees (all upheld)
- **Additive schema only** (nullable/defaults) — no destructive migration; production `prisma db push` reported *"now in sync … Done in 568ms"* with no data-loss prompt.
- **Inbox performance / realtime / queue / billing untouched** — the SSE hook, polling, send, and pause code were not modified. The drawer is an isolated component that lazily fetches two read-only endpoints.
- **WhatsApp stability** — no new send path; manual follow-ups reuse the protected broadcast queue.
- **Tenant isolation** — every new endpoint is `userId`-scoped and `force-dynamic`; unauth requests return `401`.
- **Fast customer open** — profile is one bounded query set (`findFirst` + one `aggregate` + last order); the heavier timeline is a separate lazy endpoint.

---

## 5. Verification

### Pre-deploy (local)
- ✅ `tsc --noEmit` — exit 0, no type errors.
- ✅ `npm run build` (`prisma generate && next build`) — compiled successfully; all four `customers/[id]/*` routes built; inbox bundle 17.6 kB.
- ✅ **Headless end-to-end** against a seeded SQLite DB with a minted session cookie:
  - `GET /profile` → correct facts; **orderCount/totalSpent/AOV aggregated correctly** (1 order → 1250; after a manual order → 2 orders / 2250 / 1125).
  - `GET /timeline` → all 6 event types present, verified **sorted newest→oldest**.
  - `POST /crm` → `add_tag`, `remove_tag`, `set_vip`, `assign`, `archive`, `escalate` (created a real ticket), `manual_order` (created order + items + timeline) all persisted.
  - Manual follow-up via `/api/recovery/action` → created a queued recovery broadcast (no direct send).
- ✅ Confirmed inbox polling / realtime / send / pause code paths were not modified.

### Post-deploy (production · `https://app.keyone1.com`)
| Check | Result |
|-------|--------|
| `GET /api/health` | **200** |
| `GET /login` | **200** |
| `GET /dashboard/inbox` (unauth) | **307** → login (correct) |
| `GET /api/customers/:id/profile` (unauth) | **401 `{"error":"unauth"}`** (deployed + gated) |
| `GET /api/customers/:id/timeline` (unauth) | **401** |
| `POST /api/customers/:id/crm` (unauth) | **401** |

---

## 6. Deploy result
- Single deploy via `./deploy.sh`: committed → pushed `origin/main` → VPS `git reset --hard` → service stopped → `npm ci` → `npm run build` → `prisma db push --skip-generate` (additive) → service restarted.
- VPS build: **succeeded**. Schema sync: **"now in sync … Done in 568ms"** (non-destructive).
- Service status after restart: **SERVICE_RUNNING**.
- Commits: `feat(inbox): Customer 360 CRM profile slide-over` + the deploy commit.

---

## 7. Remaining / future ideas
- **Note history** → a small `CustomerNote` table would let edited notes appear as dated timeline events (today notes live in one editable field, surfaced in the notes card rather than fabricated as timestamped events).
- **Profile photo upload** → `photoUrl` is wired through the schema, API, and avatar; add an upload/Gravatar/WhatsApp-avatar source to populate it.
- **Order rollup backfill** → optionally maintain `orderCount`/`totalOrderValue`/`lastOrderAt` on the order write-path so the scoring engines get the order signal (currently they read 0). Deferred intentionally to avoid changing live scoring inputs in this change.
- **Dedicated full-page 360** → reuse the same component/endpoints on `/dashboard/customers/[id]` for a non-inbox CRM view.
- **Inline timeline actions** → jump-to-message, open-order, reopen-escalation from timeline rows.
- **Bulk CRM** → multi-select tag/assign/VIP from the customers list.
