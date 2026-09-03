# UI Product Surface Transformation — Phase 6

**Date:** 2026-09-03
**Branch:** `claude/domain-migration-inventory-b12e5a`

## Objective

Visual polish + design system consistency + accessibility quality across four secondary product surfaces: Automation, Quick Replies, Analytics, Knowledge. Migrate raw inline classes to WKEYONE design system tokens (`.card`, `.input`, `.label`, `.btn-primary`, `.btn-ghost`). Add dialog roles and accessible names to all modals and icon-only buttons.

## Constraints

- Existing libraries only (Tailwind, Lucide, CVA, Radix primitives, WKEYONE CSS tokens)
- No shadcn/ui install
- No structural rewrites — additive polish and consistency fixes
- Meta/Bridge/WhatsApp send pipeline untouched

---

## Surface 1: Automation (`automation-builder-ui.tsx`, `rule-builder-ui.tsx`)

**Status:** Already uses `.card`, `.input`, `.label`, `.btn-primary`, `.btn-ghost`, `.page-title`, `.page-desc`.

### Findings & Fixes

| Issue | Fix | File |
|-------|-----|------|
| Toggle button uses `title` instead of `aria-label` | Changed to `aria-label` | automation-builder-ui.tsx |
| Create modal lacks dialog role | Added `role="dialog" aria-modal="true" aria-label` | automation-builder-ui.tsx |
| Create modal close button has no accessible name | Added `aria-label="إغلاق"` | automation-builder-ui.tsx |
| Edit modal lacks dialog role | Added `role="dialog" aria-modal="true" aria-label` | automation-builder-ui.tsx |
| Edit modal close button has no accessible name | Added `aria-label="إغلاق"` | automation-builder-ui.tsx |
| Toggle button uses `title` instead of `aria-label` | Changed to `aria-label` | rule-builder-ui.tsx |
| Delete button has no accessible name | Added `aria-label="حذف ${rule.name}"` | rule-builder-ui.tsx |
| Create modal lacks dialog role | Added `role="dialog" aria-modal="true" aria-label` | rule-builder-ui.tsx |
| Create modal close button has no accessible name | Added `aria-label="إغلاق"` | rule-builder-ui.tsx |
| Edit modal lacks dialog role | Added `role="dialog" aria-modal="true" aria-label` | rule-builder-ui.tsx |
| Edit modal close button has no accessible name | Added `aria-label="إغلاق"` | rule-builder-ui.tsx |

### Already Good

- Both sections use design system classes consistently
- Grouped event cards with channel icons
- Create/edit modals with `.card`, `.input`, `.label`, `.btn-primary`, `.btn-ghost`
- Empty states with Zap icon and CTA
- `useConfirm` for destructive actions
- Responsive: proper stacking at 375px

---

## Surface 2: Quick Replies (`quick-replies-ui.tsx`)

**Status:** Had PageHeader, EmptyState, Skeleton, but most form elements used raw inline classes.

### Findings & Fixes

| Issue | Fix |
|-------|-----|
| Add form container uses raw classes | Changed to `.card` |
| List container uses raw classes | Changed to `.card` |
| Trigger keywords label uses raw classes | Changed to `.label` |
| Reply label uses raw classes | Changed to `.label` |
| Trigger keywords input uses raw classes | Changed to `.input` |
| Reply textarea uses raw classes | Changed to `.input resize-none` |
| Add button uses raw classes | Changed to `.btn-primary` |
| Search input uses raw classes | Changed to `.input` |
| Edit mode trigger input uses raw classes | Changed to `.input` + added `aria-label="الكلمات المفتاحية"` |
| Edit mode reply textarea uses raw classes | Changed to `.input resize-none` + added `aria-label="نص الرد"` |
| Edit cancel button uses raw classes | Changed to `.btn-ghost` |
| Edit button uses raw classes | Changed to `.btn-ghost` |

### Already Good

- PageHeader component
- EmptyState with search-no-results variant
- Skeleton loading states
- Toggle/delete buttons already had `aria-label`
- `useConfirm` for delete
- `useToast` for error feedback
- Search input had `aria-label`

---

## Surface 3: Analytics (`analytics-ui.tsx`)

**Status:** Very well-built — uses `card`, `section-title`, `metric-cell`, `EmptyState`, `LimelightTabs` throughout.

### Findings & Fixes

| Issue | Fix |
|-------|-----|
| SVG chart has no accessible label | Added `role="img" aria-label="مخطط حركة الرسائل اليومية"` |

### Already Good

- `page-title` + `page-desc` header with LimelightTabs date selector
- Metrics grid with `metric-cell`, `metric-value`, `metric-label` design tokens
- Custom SVG line chart with gradients and axis labels
- Two-column card grids for intent, sentiment, lead distribution, tags, top customers, quick replies
- EmptyState for all data-dependent sections
- Distribution bars with proportional fills
- Customer links with lead score badges
- Error state with retry
- Responsive: `sm:grid-cols-4` metrics, `lg:grid-cols-2` card grids

---

## Surface 4: Knowledge (`knowledge-ui.tsx`, `page.tsx`)

**Status:** Well-built with `.card`, `.input`, `.label`, `.btn-primary`, `.btn-ghost`, `.section-title`. Needed header consistency and modal a11y.

### Findings & Fixes

| Issue | Fix | File |
|-------|-----|------|
| Page header lacks border-b separator | Wrapped in `border-b border-white/[0.05] pb-5 mb-6` | page.tsx |
| URL import input has no accessible name | Added `aria-label="رابط الاستيراد"` | knowledge-ui.tsx |
| Document edit button uses `title` | Changed to `aria-label="تعديل ${d.title}"` | knowledge-ui.tsx |
| Document delete button uses `title` | Changed to `aria-label="حذف ${d.title}"` | knowledge-ui.tsx |
| DocModal lacks dialog role | Added `role="dialog" aria-modal="true" aria-label` | knowledge-ui.tsx |
| DocModal close button has no accessible name | Added `aria-label="إغلاق"` | knowledge-ui.tsx |
| FaqModal lacks dialog role | Added `role="dialog" aria-modal="true" aria-label` | knowledge-ui.tsx |
| FaqModal close button has no accessible name | Added `aria-label="إغلاق"` | knowledge-ui.tsx |
| FAQ remove button has no accessible name | Added `aria-label="حذف السؤال"` | knowledge-ui.tsx |
| ProductImportModal lacks dialog role | Added `role="dialog" aria-modal="true" aria-label` | knowledge-ui.tsx |
| ProductImportModal close button has no name | Added `aria-label="إغلاق"` | knowledge-ui.tsx |

### Already Good

- Training status panel with stats grid
- Import bar with URL, file upload, FAQ builder, product import
- Document cards with source badges, hit counts, time-ago
- Three modals (doc, FAQ, products) using design system classes
- `useConfirm` for destructive actions
- Responsive: `md:grid-cols-2` for documents and import bar

---

## Summary

| Surface | Changes | Design System | A11y | Visual |
|---------|---------|---------------|------|--------|
| Automation | 11 fixes | Already adopted | Dialog roles, button labels | — |
| Quick Replies | 12 fixes | Full migration | Edit input labels | `.card`, `.input`, `.label`, `.btn-*` |
| Analytics | 1 fix | Already adopted | SVG chart role | — |
| Knowledge | 11 fixes | Already adopted | Dialog roles, button labels | Header border-b |

**Total:** 35 fixes across 6 files.

## Verification

- TypeScript: PASS (0 new errors; 5 pre-existing Prisma `mode` errors in admin files)
- Browser: All 4 surfaces rendered and verified at desktop + 375px mobile
- Console: Zero errors across all surfaces
- Compilation: All edits compiled cleanly via SWC
