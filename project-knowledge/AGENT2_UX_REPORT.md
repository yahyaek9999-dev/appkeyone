# KEYONE — Premium SaaS UX Pass (Agent 2)

**Date:** 2026-06-03
**Scope:** Dashboard UX, Mobile UX, Onboarding, Empty States, Customer Journey, Customer 360, Inbox, Integrations, Meta Cloud
**Quality bar:** Stripe · Linear · Intercom · Attio
**Model:** Claude Sonnet 4.6 (implementation + audits)
**Result:** ✅ Typecheck pass · ✅ Build pass (78/78 pages) · Additive-only · WhatsApp send pipeline untouched

---

## 1. Method

Two read-only audits were run first (a UX audit and a structural sweep), each grounded in the real code with `file:line` references. Findings were **verified against source before acting** — one headline claim was found false and discarded (see §8). Implementation then proceeded as a single additive pass: two new shared UI primitives, then a mechanical cleanup across ~25 client components and pages.

No schema changes. No API/route logic changes. No edits to the WhatsApp send pipeline, queue, billing, or broadcast worker.

---

## 2. New shared primitives

Premium SaaS products never use the browser's native `alert()` / `confirm()` — they block the viewport (especially harmful on mobile) and break the visual language. Two reusable, dark-theme, RTL-aware primitives were added and mounted once at the dashboard root.

| File | Export | Purpose |
|---|---|---|
| `components/ui/toast.tsx` | `ToastProvider`, `useToast()` | Non-blocking toasts — `success() / error() / info()`, auto-dismiss (4s), stacked, safe-area aware, dismissible. Replaces every `alert()`. |
| `components/ui/confirm-dialog.tsx` | `ConfirmProvider`, `useConfirm()` | Promise-based modal — `await confirm({ title, body, danger })` returns `boolean`. Esc/Enter/overlay support, red `danger` variant for destructive actions. Replaces every `confirm()`. |

Both are mounted in `app/dashboard/layout.tsx` wrapping the whole dashboard, so any client component can call the hooks. Each hook has a graceful fallback if used outside the provider.

---

## 3. Native dialog elimination (mobile-blocking → premium)

Every native `alert()` / `confirm()` across the dashboard was replaced. Destructive actions (delete, remove, blacklist, rotate keys, cancel campaign, clear kill-switch, disconnect WhatsApp) now use the **red `danger` confirm dialog**; failures use **error toasts**; successes use **success/info toasts**.

**Files updated (16):**
`inbox/inbox-ui.tsx`, `inbox/customer-360.tsx`, `integrations/integrations-ui.tsx`, `products/products-ui.tsx`, `coupons/coupons-ui.tsx`, `broadcasts/broadcasts-ui.tsx`, `recovery/recovery-ui.tsx`, `quick-replies/quick-replies-ui.tsx`, `knowledge/knowledge-ui.tsx`, `suggestions/suggestions-ui.tsx`, `safety/safety-ui.tsx`, `orders/[id]/order-actions.tsx`, `customers/[id]/delete-button.tsx`, `export/export-ui.tsx`, `whatsapp/whatsapp-ui.tsx`.

**Notable upgrades:**
- **Customer 360 blacklist** now requires a `danger` confirmation before silencing a customer (was a one-click irreversible action).
- **WhatsApp disconnect** now warns that the bot will stop replying before confirming.

Verification: a final grep confirms **zero native `alert(` / `confirm(`** remain in `app/dashboard/`.

---

## 4. Developer wording removed from the UI

Non-technical Arabic-speaking merchants were seeing raw library names, API enums, and English infra terms. All user-facing leaks were translated/mapped to plain Arabic.

| Before (shown to user) | After | Location |
|---|---|---|
| `QR (whatsapp-web.js)` | `ربط QR Code` | usage, compliance, live-ops |
| `GREEN` / `YELLOW` / `RED` | `ممتازة` / `متوسطة` / `ضعيفة` | usage, compliance, meta-cloud |
| `TIER_50` … `TIER_100K` | `50 رسالة/يوم` … `100,000 رسالة/يوم` | meta-cloud, compliance |
| `✓ api_access`, `✓ follow_ups` … | `الوصول البرمجي`, `المتابعات التلقائية` … | usage feature flags |
| `Analytics` / `WA Sessions` / `Priority` / `Quality:` | `التحليلات` / `جلسات واتساب` / `أولوية الإرسال` / `جودة الرقم` | usage |
| `Dead-letter` | `فشلت نهائيًا` | compliance |
| `صحة الـ Webhooks` / `القوالب (Templates)` | `صحة استقبال الأحداث` / `القوالب المعتمدة` | compliance |
| raw `category` / `action` enums | Arabic label maps | compliance audit table |
| `queued / sending`, `Safety + angry alerts`, `QR mode`, `Realtime Ops` | Arabic equivalents | live-ops strip |
| `BOT` (avatar fallback) | bot name / `البوت` | dashboard recent messages |
| `الطابور الآمن` (internal infra) | `تُرسل للعميل مباشرة` | customer 360 |
| `Webhook URL` / `API Key` / `Webhook Secret` | Arabic gloss + term kept in parens | integrations credentials |
| raw `order.created` event types | `طلب جديد`, `تم الدفع` … (label map) | integrations event log |
| `...` (pending button) | `جاري الحفظ...` | meta-cloud form |

Merchant-facing technical tokens that merchants **must** copy (Phone Number ID, WABA ID, Access Token) were kept — but led with an Arabic gloss.

---

## 5. Empty states (no more bare/blank zero-data)

The shared `EmptyState` component (icon + title + description + optional CTA) replaced bare `<div>/<p>` zero-data messages across the app, so every list reads as intentional, not broken.

**Converted:** integrations (list + event log), analytics (tags + top-customers), quick-replies, recovery, products, coupons, broadcasts, escalations, segments, compliance audit, leads (mobile empty). Each now carries a contextual icon and a one-line "why it's empty / what to do next" description.

---

## 6. Mobile UX & horizontal-scroll elimination

The brief required **no horizontal scrolling and no broken mobile layouts**. Fixes:

| Issue | Fix |
|---|---|
| **Leads table** forced `min-w-[720px]` → page-level horizontal scroll on phones | Added a dedicated **mobile card view** (`md:hidden`); table is now `hidden md:block`. No scroll, full data parity. |
| **Analytics chart** forced `min-w-[600px]` | Dropped forced min-width below `sm` (`min-w-0 sm:min-w-[600px]`); SVG already stretches via `preserveAspectRatio="none"`. |
| **Compliance audit table** had no scroll wrapper + `whitespace-nowrap` date | Wrapped in `overflow-x-auto` with `min-w-[640px]`; converted empty state. |
| **Live-ops strip** jumped `grid-cols-1 → lg:grid-cols-6` (wasted tablet space) | Now `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`. |
| **Coupons stats** `grid-cols-4` crushed on 375px | Now `grid-cols-2 sm:grid-cols-4`. |
| **Mobile header** hardcoded `KEYONE`, never showed current page | Now uses the configured `brandName` + shows the **current page label** (`brand / page`), white-label safe. |

---

## 7. Navigation, onboarding & journey

- **Sidebar IA:** 30 flat, ungrouped nav items → **6 labelled sections** (`الرئيسية`, `المحادثات`, `التجارة`, `النمو والذكاء`, `إعداد البوت`, `الحساب والنظام`) — matching the grouped-nav pattern of Linear/Stripe. The two "Brain"-icon duplicates were differentiated (`ذكاء المبيعات` now uses a distinct `Lightbulb` icon). *(Note: an RBAC permission filter on the sidebar was added in parallel by another workstream and is preserved.)*
- **Onboarding completion bug (real, verified):** the dashboard's getting-started checklist could never mark the "connect WhatsApp" step complete because the `bot` query omitted `whatsappStatus`. Added the field to the `select` and fixed the reference — the step now reflects real connection state.
- **Customer journey:** the audit's claimed "missing `/onboarding` route" was **false** — `app/onboarding/{page,wizard}.tsx` is a working 5-step wizard, and all 30 nav pages render real content. No dead pages exist. (See §8.)

---

## 8. Audit findings corrected (verified, not taken on faith)

| Claimed | Reality |
|---|---|
| 🔴 "P0: `/onboarding` route missing → new users 404" | **False.** `app/onboarding/page.tsx` + `wizard.tsx` exist and build into a real route (`/onboarding`, 5.09 kB in build output). New users land on a working 5-step wizard. |
| "Several nav pages may be stub/dead" | **False.** Structural sweep confirmed all 30 nav destinations render substantive content. "No dead pages" already held. |

These were discarded rather than "fixed", avoiding wasted/incorrect changes.

---

## 9. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass (after `prisma generate` — the only errors were a stale client missing the `TeamMember` model from parallel RBAC work; regenerating cleared them) |
| `npm run build` | ✅ **Compiled successfully**, 78/78 pages generated, every changed route compiled |
| Native `alert(`/`confirm(` remaining in `app/dashboard/` | ✅ **0** |
| WhatsApp send pipeline / queue / billing / schema | ✅ Untouched (additive UI only) |

**Not verified (honest gaps):** changes were validated by typecheck + production build, **not** by a live browser/device pass. Recommended quick manual QA after deploy: (1) trigger a toast (e.g. a failed save) and a danger confirm (e.g. delete a coupon) on a real phone; (2) open `/dashboard/leads` on a ≤375px viewport and confirm zero horizontal scroll; (3) confirm the getting-started "WhatsApp" step turns green on a connected account.

---

## 10. Files changed (summary)

**New (2):** `components/ui/toast.tsx`, `components/ui/confirm-dialog.tsx`
**Edited (~25):** `app/dashboard/layout.tsx`, `mobile-nav.tsx`, `nav-items.tsx`, `live-ops-strip.tsx`, `page.tsx`, `usage/page.tsx`, `compliance/page.tsx`, `leads/page.tsx`, `analytics/analytics-ui.tsx`, `escalations/page.tsx`, `settings/meta-cloud/meta-cloud-form.tsx`, and the 16 client components listed in §3 (some overlap).

All changes are additive and reversible; no destructive or pipeline-touching edits.
