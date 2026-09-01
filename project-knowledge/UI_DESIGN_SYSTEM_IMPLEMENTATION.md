# WKEYONE — UI Design System Implementation

**Phase:** 2 (Primitives + Consolidation)  
**Date:** 2026-09-02  
**Implementor:** Claude Sonnet 4.6  
**Branch:** claude/domain-migration-inventory-b12e5a  
**Based on:** project-knowledge/UI_DESIGN_SYSTEM_AUDIT.md

---

## A) Implemented

### Phase 2A — Core Primitives (`saas/components/ui/primitives/`)

| File | Purpose | Source token | Variants |
|------|---------|--------------|----------|
| `button.tsx` | Accessible button with CVA variants | `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-outline`, `.btn-premium` | `variant`: primary/ghost/danger/outline/premium; `size`: sm/md/lg |
| `input.tsx` | Input field with forwardRef | `.input` | None (className prop for overrides) |
| `textarea.tsx` | Textarea with forwardRef | `.input resize-none` | None |
| `label.tsx` | Form label with forwardRef | `.label` | None |
| `form-field.tsx` | label + input slot + error/hint | Composes Label | Slots: label, hint, error, required marker |
| `badge.tsx` | Status/indicator badge | Brand tokens | `variant`: brand/gold/success/danger/warning/neutral |
| `card.tsx` | Content container | `.card` | `padding`: none/sm/md/lg/xl |
| `dialog.tsx` | Accessible modal (Radix) | `.canvas-raised`, brand shadow tokens | `showClose` prop; exposes Dialog/Content/Header/Footer/Title/Description |
| `index.ts` | Barrel export | — | All primitives re-exported |

**New dependencies added:**
- `class-variance-authority` — variant management for Button and Badge
- `@radix-ui/react-dialog` — focus trap, scroll-lock, portal for Dialog

**Dependencies NOT added** (existing capability sufficient):
- shadcn/ui ❌ — would collide with WKEYONE token layer
- Radix Select/Popover/DropdownMenu/Tooltip/Tabs ⏳ — deferred to next batch

### Phase 2D — Dialog Architecture

`components/ui/primitives/dialog.tsx` is the canonical accessible dialog primitive:
- Built on `@radix-ui/react-dialog` (v1.x)
- Provides: focus trap, Escape to close, scroll-lock, portal (renders at document root)
- Preserves: WKEYONE canvas/gold visual language (`bg-canvas-raised`, `border-white/[0.09]`, `shadow-float`)
- RTL: Close button positioned `left-4` (RTL: visually right) ✓
- `aria-labelledby` and `aria-describedby` wired via `DialogTitle`/`DialogDescription`
- API exports: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`, `DialogPortal`, `DialogOverlay`

**Note:** `ConfirmProvider` (`components/ui/confirm-dialog.tsx`) was NOT migrated to Radix Dialog in this phase. It is working correctly, and migration should be done as a follow-up when the team is ready to validate focus-trap behavior in production.

### Phase 2E — Product Patterns (`saas/components/patterns/`)

| File | Purpose | Notes |
|------|---------|-------|
| `page-header.tsx` | `<h1 className="page-title">` + description + actions row | Used by 30+ dashboard pages; additive primitive, no migration required |
| `loading-state.tsx` | Spinner with `role="status"` and `aria-live="polite"` | `size`: sm/md/lg |
| `error-state.tsx` | Error panel with `role="alert"` | Accepts title, message, action slot |
| `index.ts` | Barrel export | — |

### Phase 2B — Login A11y Fix

**File:** `saas/app/(auth)/login/page.tsx`

**Problem (VERIFIED in Phase 1):** Both login inputs had visible `<label>` elements but no `htmlFor`/`id` association. Screen readers could not announce the labels.

**Fix:** Added `htmlFor="login-email"` + `id="login-email"` on email field; `htmlFor="login-password"` + `id="login-password"` on password field.

**Verification:**
```javascript
// Confirmed in browser at http://localhost:3000/login
emailInput.labels.length === 1  // true
emailInput.labels[0].textContent.trim() === "البريد الإلكتروني"  // true
passwordInput.labels.length === 1  // true
passwordInput.labels[0].textContent.trim() === "كلمة المرور"  // true
```

Zero visual change.

### Phase 2C — Button Consolidation

**Migrated** `ai-btn ai-btn-primary` → `btn-primary` and `ai-btn ai-btn-ghost` → `btn-ghost` across 9 files:

| File | Changed |
|------|---------|
| `app/dashboard/activation-guard.tsx` | ai-btn-primary → btn-primary |
| `app/onboarding/wizard.tsx` | ai-btn-primary × 2, ai-btn-ghost × 1 |
| `app/dashboard/testing-arena/testing-arena-client.tsx` | ai-btn-primary |
| `app/dashboard/customers/import/import-ui.tsx` | ai-btn-primary, ai-btn-ghost |
| `app/dashboard/inbox/inbox-ui.tsx` | ai-btn-primary × 2, ai-btn-ghost × 4 |
| `app/dashboard/inbox/customer-360.tsx` | ai-btn-primary × 3, ai-btn-ghost × 5 |
| `app/dashboard/products/products-ui.tsx` | ai-btn-primary × 2, ai-btn-ghost × 1 |
| `app/dashboard/coupons/coupons-ui.tsx` | ai-btn-primary |
| `app/dashboard/segments/segments-ui.tsx` | ai-btn-primary × 2, ai-btn-ghost × 1 |

**Semantic finding:** `.ai-btn-primary` and `.btn-primary` differ only in default padding (`px-5` vs `px-4`). All call sites already carry explicit `px-*` overrides, making the effective render identical.

**CSS classes `.ai-btn-primary` and `.ai-btn-ghost` remain in `globals.css`** — they have 0 call sites now but are retained until a human reviewer confirms safe deletion. See §F (remaining debt).

---

## B) Browser-Verified

| Check | Result |
|-------|--------|
| `/login` renders correctly | ✓ |
| Email input label associated (`element.labels.length === 1`) | ✓ verified via JS |
| Password input label associated (`element.labels.length === 1`) | ✓ verified via JS |
| Login page visual design unchanged | ✓ screenshot confirmed |
| Zero console errors on `/login` | ✓ |
| TypeScript typecheck (`tsc --noEmit`) | ✓ 0 errors |
| Dev server compiles all modified pages | ✓ (server logs confirm) |

---

## C) Refactored

- 9 files: `ai-btn-primary`/`ai-btn-ghost` → `btn-primary`/`btn-ghost`
- Login page: 2 inputs gained `id` + 2 labels gained `htmlFor`

---

## D) Preserved Intentionally

- All existing `.btn-*`, `.card`, `.ai-card`, `.input`, `.data-table`, `.ops-table`, `.crm-row` CSS classes in `globals.css` — untouched
- All 44 existing `components/ui/*.tsx` files — untouched
- Landing page visual system (`.lp-*` classes) — untouched
- `ConfirmProvider` / `ToastProvider` / `CommandPalette` / `HelpDrawer` — untouched
- `limelight-tabs.tsx` — untouched (Radix Tabs migration deferred)
- All marketing/animation components — untouched
- WhatsApp send pipeline — NOT TOUCHED
- Meta / Bridge — NOT TOUCHED

---

## E) Not Touched

- Database schema, seed, Prisma migrations
- Production environment (.env on server)
- Caddy / DNS / domain configuration
- Authentication architecture (custom JWT/cookie)
- Billing / subscription logic
- All dashboard product logic (customers, orders, products, broadcasts, inbox, knowledge, integrations, settings)
- `broadcasts-ui.tsx` (1108 lines) — deferred; requires its own targeted audit

---

## F) Remaining Migration Debt

### High priority

| Debt | Details |
|------|---------|
| Delete `.ai-btn-primary` / `.ai-btn-ghost` from `globals.css` | 0 call sites after this phase; safe to delete. Requires human sign-off. Lines 224–232 and 348. |
| Delete `.ai-card` from `globals.css` | 0 call sites after verification. Near-identical to `.card`. |
| Inline input styles: 105 files still use raw `rounded-lg border border-white/10 bg-white/5 px-3...` | Migrate to `<Input>` or `.input` class on next page-by-page touch. |
| Login admin page (`app/admin/login/page.tsx`) | May have same label a11y gap — not inspected. |
| `broadcasts-ui.tsx` (1108 lines) | Needs targeted audit before splitting. |

### Medium priority

| Debt | Details |
|------|---------|
| Radix `Select` | Native `<select>` is unstyled in many form pages |
| Radix `Popover` / `DropdownMenu` / `Tooltip` | Ad-hoc inline implementations |
| Radix `Tabs` | `limelight-tabs.tsx` is CSS-only (no roving tabindex) |
| `PageHeader` adoption | 30+ dashboard pages repeat title/desc pattern; migrate on next touch |
| `ConfirmProvider` → Radix Dialog | Focus trap missing in current implementation |
| `LoadingState` adoption | Currently each page has its own spinner |
| `ErrorState` adoption | Currently each page has its own error UI |
| `broadcasts-ui.tsx` split | Large file but needs analysis before splitting |

### Low priority

| Debt | Details |
|------|---------|
| Radix `Switch`, `Checkbox`, `Radio` | Current implementations are native (unstyled) |
| `DataTable` primitive | `data-table`/`ops-table` CSS classes exist; React wrapper with sort/paging deferred |
| `FilterBar` pattern | Toolbar + filter-tab patterns used across 10+ pages; compositional pattern sufficient |
| Skip-link | No skip navigation link present |
| Landmarks audit | `<nav>`, `<main>`, `<aside>` present but not consistently used |
| `gsap` vs `framer-motion` duplication | Verify use cases before removing either |

---

## G) Remaining UNKNOWN Items

- `app/admin/login/page.tsx` — may have same label a11y gap
- `broadcasts-ui.tsx` internals — does it use ConfirmProvider or inline dialogs?
- Mobile viewport (375px) render quality of new primitives — not tested
- Dark theme toggle behavior on primitive components (WKEYONE uses canvas-dark by default; no toggle in the app)
- Whether `gsap` is still used or is removable legacy
- Authenticated dashboard page quality after button consolidation (no test creds available locally)

---

## H) Commits

| Commit | Message |
|--------|---------|
| `dce195c` | `feat(ui): establish core design primitives (Phase 2A + 2D + 2E)` |
| `1f76b68` | `fix(a11y): associate login email and password labels` |
| `dd56b77` | `refactor(ui): consolidate button variants — migrate ai-btn-primary/ghost to btn-primary/ghost` |

---

## I) Recommended Next Implementation Batch

**Batch: Phase 2 — Continuation**

Priority order:

1. **Delete dead CSS classes** — `.ai-btn-primary`, `.ai-btn-ghost` from `globals.css` (0 call sites, safe). 2-line change per class.

2. **Radix Select** — Add `@radix-ui/react-select`, create `components/ui/primitives/select.tsx`. Many settings forms have unstyled native selects.

3. **Radix DropdownMenu** — Add `@radix-ui/react-dropdown-menu`. Several pages render custom dropdown-like panels. One file at a time.

4. **`ConfirmProvider` → Radix Dialog migration** — Update `confirm-dialog.tsx` to use the new `<Dialog>` primitive. Gains focus trap. API stays the same (context-based `useConfirm()`).

5. **Admin login a11y audit** — Read `app/admin/login/page.tsx`, apply same label fix if needed.

6. **`broadcasts-ui.tsx` analysis** — Read the 1108-line file. Map: dialog implementations, forms, filter bars, empty states. Propose split only if clear benefit.

7. **Inline input style sweep** — On every page touched for other reasons, replace `rounded-lg border border-white/10 bg-white/5 px-3 py-2...` with `<Input className="...">` or `className="input"`.

8. **`PageHeader` adoption** — As pages are touched, replace `<h1 className="page-title">` + `<p className="page-desc">` with `<PageHeader title="..." description="...">`.

**Do NOT do a big-bang migration. Each PR should touch ≤ 5 files.**

---

## Design System State After Phase 2

```
Foundation (existing — unchanged)
├── Tokens        tailwind.config.ts ✓
├── CSS classes   app/globals.css @layer components ✓
├── Icons         lucide-react ✓
└── Fonts         Cairo (ar), system stack (en) ✓

Primitives (NOW EXISTS)
├── Button        ✓ variants: primary | ghost | danger | outline | premium
├── Input         ✓
├── Textarea      ✓
├── Label         ✓
├── FormField     ✓
├── Card          ✓ padding variants
├── Badge         ✓ variants: brand | gold | success | danger | warning | neutral
└── Dialog        ✓ (Radix — focus trap, portal, scroll-lock)

Patterns (NOW EXISTS)
├── PageHeader    ✓
├── LoadingState  ✓
└── ErrorState    ✓

Still needed
├── Select        ⏳ (Radix)
├── DropdownMenu  ⏳ (Radix)
├── Popover       ⏳ (Radix)
├── Tooltip       ⏳ (Radix)
├── Tabs          ⏳ (Radix)
├── Switch        ⏳
├── Checkbox      ⏳
├── FilterBar     ⏳
├── DataTable     ⏳
└── StatCard      ⏳
```
