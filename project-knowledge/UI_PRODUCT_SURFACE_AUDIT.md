# UI Product Surface Audit — Phase 3

**Branch:** `claude/domain-migration-inventory-b12e5a`  
**Audited:** 2026-09-01 / 2026-09-02  
**Scope:** Authenticated merchant dashboard, desktop + 375 px mobile  
**Method:** Live browser inspection (localhost:3000), DOM queries, screenshot verification  
**Status:** COMPLETE (audited areas below); remaining areas blocked/unneeded  

---

## Summary

| Area | Status | Findings | Fixed |
|------|--------|----------|-------|
| Dashboard home (`/dashboard`) | ✅ Audited | 2 a11y | ✅ `9c69000` |
| Broadcasts (`/dashboard/broadcasts`) | ✅ Audited | 15 label/input + 2 dialog migrations | ✅ `976517c`, `9c69000` |
| Quick Replies (`/dashboard/quick-replies`) | ✅ Audited | 4 a11y | ✅ `9c69000` |
| WhatsApp Numbers (`/dashboard/settings/numbers`) | ⛔ STOP | Live Meta integration — do not touch | — |
| Bridge settings | ⛔ STOP | Live Bridge — do not touch | — |
| Analytics, Escalations, Playground | 🔲 Not reached | Low-risk; schedule separately | — |

---

## Findings & Fixes

### 1. Dashboard home — `app/dashboard/page.tsx`

**Finding A — Unlabelled landmark section**  
`<section>` containing the SLA attention queue had no accessible name. Screen readers would announce it as "section" with no context.  
**Fix:** Added `aria-labelledby="attention-queue-heading"` on `<section>` and `id="attention-queue-heading"` on the `<h2>`.

**Finding B — Status text not a live region**  
The SLA status string (e.g. "محادثة تنتظر") updates dynamically but had no `role="status"` or `aria-live`. Assistive tech would miss the update.  
**Fix:** Added `role="status" aria-live="polite"` to the `<p>` element.

---

### 2. Broadcasts — `app/dashboard/broadcasts/broadcasts-ui.tsx`

**Phase 2C (commit `976517c`) — Dialog + button**  
- Replaced 2 raw `div.fixed.inset-0` overlays with `<Dialog>` from Radix (`components/ui/primitives/dialog.tsx`): focus trap, Escape-to-close, scroll-lock, portal.  
- Replaced `bg-rose-500` on the primary CTA with `btn-primary` (emerald brand colour).  
- Migrated 15 native inputs to `.input` CSS class.

**Phase 3 (commit `9c69000`) — Label/input association**  
All 15 labels in the create modal and 6 labels in the edit modal lacked `htmlFor`/`id` pairing. Screen readers could not associate labels with their controls.  

Create modal fields fixed:
- `bc-create-title` — campaign title input
- `bc-create-audience` — audience select
- `bc-create-date-from` / `bc-create-date-to` — date range
- `bc-create-template` — message textarea
- `bc-create-template-b` — B-variant textarea
- `bc-create-coupon` — coupon code input
- `bc-create-image` — image URL input
- AI generator inputs (no visible label context) — `aria-label` used instead

Edit modal fields fixed:
- `bc-edit-title` — campaign title
- `bc-edit-template` — message textarea
- `bc-edit-coupon` — coupon code
- `bc-edit-image` — image URL
- `bc-edit-scheduled-at` — datetime-local input

---

### 3. Quick Replies — `app/dashboard/quick-replies/quick-replies-ui.tsx`

**Finding A — Icon-only buttons without accessible names**  
Toggle (Power/PowerOff) button used `title=""` (not reliable as accessible name). Delete (Trash2) button had no name at all.  
**Fix:** Replaced with `aria-label`:
- Toggle: `aria-label={q.enabled ? "تعطيل الرد السريع" : "تفعيل الرد السريع"}` (dynamic)
- Delete: `aria-label="حذف الرد السريع"`

**Finding B — Add-form labels not associated**  
"الكلمات المفتاحية" label and "الرد" label had no `htmlFor`; inputs had no `id`.  
**Fix:** `htmlFor="qr-add-triggers"` + `id="qr-add-triggers"`, `htmlFor="qr-add-reply"` + `id="qr-add-reply"`.

**Finding C — Search input no accessible name**  
`<input type="search">` had placeholder text but no `aria-label`.  
**Fix:** `aria-label="بحث في الردود والكلمات المفتاحية"`.

---

## DOM Verification (post-fix)

```
quick-replies page — javascript_tool checks:
  triggers_label : "الكلمات المفتاحية (افصل بفاصلة"  ✅
  reply_label    : "الرد"                              ✅
  search_aria    : "بحث في الردود والكلمات المفتاحية" ✅
  toggle_aria    : "تعطيل الرد السريع"                ✅
  delete_aria    : "حذف الرد السريع"                  ✅
```

---

## Pre-existing issues (not introduced by this work)

| File | Issue |
|------|-------|
| `app/admin/payment-reviews/page.tsx` | Prisma `mode: "insensitive"` — PostgreSQL-only, fails on SQLite local dev |
| `lib/admin/finance.ts` | Same |
| `lib/admin/security.ts` | Same |

These are zero-impact in production (production runs Postgres). Not touched.

---

## Commits

| Commit | Phase | Change |
|--------|-------|--------|
| `976517c` | 2C | Broadcasts: Radix Dialog × 2, btn-primary, .input class × 15 |
| `9c69000` | 3 | Dashboard, Broadcasts, Quick Replies: a11y label/aria fixes |
