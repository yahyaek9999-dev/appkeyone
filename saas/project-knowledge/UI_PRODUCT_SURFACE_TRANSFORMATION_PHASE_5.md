# UI Product Surface Transformation — Phase 5

**Date:** 2026-09-02
**Branch:** `claude/domain-migration-inventory-b12e5a`
**Commit:** `7b285a9`

## Objective

Accessibility and design-system consistency sweep across all five customer-facing product surfaces: Inbox, Customers, Products, Orders, Broadcasts. ONE DESIGN LANGUAGE — every surface uses the same `.input`, `.btn-primary`, `.btn-ghost`, `.card`, `.data-table` tokens from `globals.css` and the same `PageHeader` / `EmptyState` / `Skeleton` patterns.

## Constraints

- Existing libraries only (Tailwind, Lucide, CVA, Radix primitives, WKEYONE CSS tokens)
- No shadcn/ui install
- No structural rewrites — additive a11y fixes only
- Meta/Bridge/WhatsApp send pipeline untouched

---

## Surface 1: Inbox (`inbox-ui.tsx`)

**Status:** PageHeader NOT applicable (specialized messaging interface)

### Findings & Fixes

| Issue | Fix |
|-------|-----|
| Conversation list `<aside>` has no landmark label | Added `aria-label="قائمة المحادثات"` |
| Search input has `placeholder` but no `aria-label` | Added `aria-label="البحث في المحادثات"` |
| Nested `<main>` inside dashboard layout's `<main>` | Changed inner to `<section aria-label="المحادثة">` |
| Profile button uses `title` instead of `aria-label` | Changed to `aria-label="عرض ملف العميل الكامل"` |
| Reply textarea has no accessible name | Added `aria-label="رسالة الرد"` |
| Suggest button uses `title` instead of `aria-label` | Changed to `aria-label="اقترح ردوداً جاهزة"` |
| Right sidebar `<aside>` has no landmark label | Added `aria-label="معلومات العميل"` |
| Notes textarea label is a `<div>`, not wired to input | Changed to `<label htmlFor="inbox-notes">` + `id="inbox-notes"` |
| Assign input label is a `<div>`, not wired | Changed to `<label htmlFor="inbox-assign">` + `id="inbox-assign"` |
| Team notes textarea label is a `<div>`, not wired | Changed to `<label htmlFor="inbox-team-note">` + `id="inbox-team-note"` |

### SWC Note

This file triggers an SWC race condition when multiple edits are applied simultaneously. All edits must be applied one at a time with 4-second waits between each. The `<main>` → `<section>` change MUST include the closing tag in the same edit or it causes a JSX tag mismatch that SWC cannot recover from.

---

## Surface 2: Customers (`customers/page.tsx`)

**Status:** PageHeader already adopted (Phase 4). Well-structured server component.

### Findings & Fixes

| Issue | Fix |
|-------|-----|
| Search form lacks `role` and `aria-label` | Added `role="search" aria-label="بحث العملاء"` |
| Search input has `placeholder` but no `aria-label` | Added `aria-label="بحث بالاسم أو الهاتف"` |

### Already Good

- PageHeader with description stats
- EmptyState with contextual actions
- Dense CRM table with proper semantic `<div>` grid
- Pagination with Arabic locale
- Avatar with online status indicator

---

## Surface 3: Products (`products-ui.tsx`)

**Status:** PageHeader, EmptyState, Skeleton all adopted.

### Findings & Fixes

| Issue | Fix |
|-------|-----|
| Search input has no `aria-label` | Added `aria-label="بحث في المنتجات"` |
| Delete button is icon-only (`<Trash2>`) with no name | Added `aria-label="حذف ${p.name}"` |
| Dialog overlay uses `createPortal` with no role/aria | Added `role="dialog" aria-modal="true" aria-label` |
| Dialog close button is icon-only with no name | Added `aria-label="إغلاق"` |
| Image remove button uses `title` not `aria-label` | Changed to `aria-label="حذف الصورة"` |

### Note

Dialog uses `createPortal` instead of Radix Dialog — lacks focus trap and escape-to-close. This is a known gap but migrating to Radix Dialog is a larger structural change beyond this phase's scope.

---

## Surface 4: Orders (`orders/page.tsx`, `orders/[id]/page.tsx`, `order-actions.tsx`)

**Status:** PageHeader, LimelightTabs, EmptyState, data-table all adopted.

### Findings & Fixes

| Issue | Fix |
|-------|-----|
| Order status `<select>` uses raw classes | Changed to `.input` design system class |
| Tracking code input has no `aria-label` | Added `aria-label="رقم التتبع"` |
| Courier name input has no `aria-label` | Added `aria-label="شركة الشحن"` |
| Tracking URL input has no `aria-label` | Added `aria-label="رابط التتبع"` |
| All 3 shipping inputs use raw classes | Changed to `.input` design system class |

### Already Good

- Orders list: proper `<table>` with `<th>`, mobile card fallback, pagination
- Order detail: semantic `<section>` blocks, shipping timeline, action banner
- OrderStatusPill component with consistent status colors
- `useConfirm` for destructive actions

---

## Surface 5: Broadcasts (`broadcasts-ui.tsx`)

**Status:** PageHeader, Radix Dialog, EmptyState, Skeleton, LiveBadge all adopted.

### Findings & Fixes

| Issue | Fix |
|-------|-----|
| Delete button is icon-only with no name | Added `aria-label="حذف ${bc.title}"` |
| Version B textarea uses raw classes | Changed to `.input resize-none` |
| Inactive days input has no label | Added `aria-label="عدد أيام عدم النشاط"` |
| Schedule datetime input has no label | Added `aria-label="موعد الإرسال المجدول"` |
| Inactive days input uses raw classes | Changed to `.input` |

### Already Good

- Radix Dialog for create and edit modals (focus trap, escape, aria)
- `htmlFor`/`id` wiring on all major form fields in dialogs
- LiveBadge with real-time broadcast status
- A/B test comparison panel
- AI optimizer panel
- UpgradeModal for plan-gated features

---

## Summary

| Surface | Changes | Design System | A11y |
|---------|---------|---------------|------|
| Inbox | 11 fixes | N/A (specialized) | Labels, landmarks, htmlFor |
| Customers | 2 fixes | Already adopted | Search form role |
| Products | 5 fixes | Already adopted | Dialog role, button labels |
| Orders | 4 fixes | `.input` adoption | Input labels |
| Broadcasts | 5 fixes | `.input` adoption | Button & input labels |

**Total:** 27 a11y/design-system fixes across 5 files, 37 insertions / 24 deletions.

## Verification

- TypeScript: PASS (0 new errors; 5 pre-existing Prisma `mode` errors in admin files)
- Browser: All 5 surfaces rendered and verified in dev server
- Accessibility tree: Confirmed landmarks and labels via browser find
