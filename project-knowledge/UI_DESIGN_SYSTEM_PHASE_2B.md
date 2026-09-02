# WKEYONE — UI Design System Phase 2B
## Targeted Verification + Architecture Review

**Date:** 2026-09-01  
**Branch:** claude/domain-migration-inventory-b12e5a  
**Analyst:** Claude Sonnet 4.6  
**Scope:** Verification of Phase 2 deliverables + architectural audit (no new features)

---

## 1. Dead CSS Verification

**Search method:** `grep -rn` across `app/`, `components/`, `lib/`, `pages/` for each class name.

| Class | Call sites found | Action taken |
|-------|-----------------|--------------|
| `.ai-btn-primary` | **0** | REMOVED from `globals.css` (lines 224-227) |
| `.ai-btn-ghost` | **0** | REMOVED from `globals.css` (lines 229-232) |
| `.ai-btn-primary:focus-visible` | **0** | REMOVED from ring-inset rule (was line 348) |
| `.ai-card` | **25** | NOT removed — live call sites across onboarding, privacy, terms, and settings pages |
| `.ai-btn` (bare) | **0** (was a composed class, never used alone) | Already gone after Phase 2C |

**Outcome:** `globals.css` is now 8 lines shorter. No visual regressions — the removed classes had zero consumers.

---

## 2. Admin Login A11y Fix

**File:** `saas/app/admin/login/page.tsx`

**Gaps found (same pattern as customer login):**

| Element | Before | After |
|---------|--------|-------|
| Email `<label>` | No `htmlFor` | `htmlFor="admin-email"` |
| Email `<input>` | No `id` | `id="admin-email"` |
| Password `<label>` | No `htmlFor` | `htmlFor="admin-password"` |
| Password `<input>` | No `id` | `id="admin-password"` |
| Show/hide password `<button>` | Icon-only, no accessible name | Added `aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}` |

**Visual change:** Zero — these are purely programmatic associations.  
**A11y impact:** Screen readers can now announce "البريد الإلكتروني — edit" and "كلمة المرور — edit" when focusing inputs. Toggle button is now announced as an action, not as an unlabeled button.

---

## 3. Mobile Verification at 375px

**Viewport tested:** 375px width (standard iPhone SE / iPhone 12 mini)  
**Method:** Browser resize + JS inspection via `window.getComputedStyle`

| Component | Expected | Actual | Result |
|-----------|----------|--------|--------|
| `<Button variant="primary">` | Correct layout | Correct layout | ✓ PASS |
| `<Button variant="ghost">` | Correct layout | Correct layout | ✓ PASS |
| `<Input>` | Full-width with `.input` styles | Full-width ✓ | ✓ PASS |
| `<Textarea>` | Full-width, resize-none | Full-width, resize-none ✓ | ✓ PASS |
| `<Label>` | Correct `.label` styles | ✓ | ✓ PASS |
| `<FormField>` | Label + input slot + hint | ✓ | ✓ PASS |
| `<Badge>` (all variants) | Inline chip layout | ✓ | ✓ PASS |
| `<Card>` (all padding variants) | Rounded card layout | ✓ | ✓ PASS |
| `<DialogContent>` | **DEFECT detected** | Edge-to-edge (no margins) | ✗ → FIXED |
| `<PageHeader>` | Title + actions wrap | ✓ | ✓ PASS |
| `<LoadingState>` | Centered spinner | ✓ | ✓ PASS |
| `<ErrorState>` | Centered error panel | ✓ | ✓ PASS |

**Dialog defect and fix:**  
Original: `w-full max-w-sm` — at 375px viewport, `w-full` resolves to 375px, which equals screen width. Zero horizontal margin, dialog touched both edges.  
Fix applied: `w-[calc(100%-2rem)] max-w-sm` — gives exactly 16px margin on each side at 375px (calc: 375 - 32 = 343px width). `max-w-sm` (384px) still caps width on larger screens.

---

## 4. `broadcasts-ui.tsx` Architectural Map

**File:** `saas/app/dashboard/broadcasts/broadcasts-ui.tsx` — 1108 lines, 1 default export, 2 local sub-components.

### Component inventory

| Lines | Name | Type | Description |
|-------|------|------|-------------|
| 121-1086 | `BroadcastsUi` | Default export | Entire page: list + 2 modals + A/B + analytics |
| 1088-1096 | `Metric` | Local component | Pure display — stat cell (label + value + icon) |
| 1098-1107 | `OptRow` | Local component | Pure display — optimizer comparison row |

### State groups in `BroadcastsUi` (17+ variables)

| Group | Variables |
|-------|-----------|
| List | `items`, `loading` |
| Create form | `creating`, `title`, `template`, `audience`, `personalize`, `submitting`, `couponCode`, `imageUrl`, `scheduleMode`, `scheduledAt`, `inactiveDays`, `dateFrom`, `dateTo` |
| Edit modal | `editing`, `editTitle`, `editTemplate`, `editCoupon`, `editImageUrl`, `editScheduledAt`, `editSubmitting` |
| AI generator | `genType`, `genProduct`, `genOffer`, `generating` |
| Analytics | `openAnalytics`, `analytics` |
| A/B test | `abMode`, `templateB`, `optimizing`, `optimization`, `openAb`, `abData` |
| Billing gate | `upgrade` |

### UI regions rendered

| Lines | Region | Notes |
|-------|--------|-------|
| 477-499 | Page header | Uses `.page-title`/`.page-desc` directly (not `<PageHeader>`). "حملة جديدة" button uses `bg-rose-500` (brand deviation — should be `.btn-primary`) |
| 501-729 | Broadcast list | Loading skeletons, empty state, list items with inline analytics + A/B panels |
| 731-1000 | Create modal | Inline `fixed inset-0 bg-black/70 z-50` overlay. NOT Radix Dialog. All inputs use `bg-white/5 border border-white/10 rounded-lg` (raw inline styles, not `.input`) |
| 1002-1075 | Edit modal | Inline `fixed inset-0 bg-black/60 z-50`. Click-outside via `onClick={() => setEditing(null)}`. No focus trap, no Escape |
| 1077-1083 | `<UpgradeModal>` | Shared component, correct usage |

### Dialog accessibility audit

| Check | Create modal | Edit modal |
|-------|-------------|------------|
| Focus trap | ❌ None | ❌ None |
| Escape to close | ❌ None | ❌ None |
| Scroll-lock | ❌ None | ❌ None |
| Portal | ❌ Inline DOM | ❌ Inline DOM |
| Click-outside | ❌ None | ✓ `onClick` on overlay |
| `role="dialog"` | ❌ None | ❌ None |
| `aria-modal` | ❌ None | ❌ None |

### Design token deviations

| Line | Element | Current class | Should be |
|------|---------|--------------|-----------|
| 493-498 | "حملة جديدة" button | `bg-rose-500 hover:bg-rose-600` | `.btn-primary` |
| 733+ | Create modal backdrop | `bg-black/70` | `.bg-black/60` (matches Edit modal) |
| 764-1059 | All form inputs | `bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm` | `className="input"` |
| 733+ | Create modal panel | `bg-slate-900` | `bg-canvas-raised` |

### Extraction classification

| Candidate | Classification | Reason |
|-----------|---------------|--------|
| `Metric` (1088-1096) | **SAFE** | Pure display, no state, no side effects |
| `OptRow` (1098-1107) | **SAFE** | Pure display, no state |
| Broadcast list item | **LIKELY** | Repeated pattern (~40 lines per item), self-contained display |
| Analytics panel | **LIKELY** | Has its own data fetch (`analytics` state), clearly bounded |
| A/B comparison panel | **LIKELY** | Self-contained state group (`abMode`, `openAb`, `abData`) |
| Create broadcast modal | **RISKY** | 270 lines, deep state coupling with main component, many cross-handlers |
| Edit broadcast modal | **LIKELY** | 73 lines, cleaner state group, mostly isolated |
| `BroadcastsUi` main | **DO NOT SPLIT** | Orchestration component — splitting adds indirection without benefit |

**Verdict:** Do NOT split `broadcasts-ui.tsx` yet. The file is large but coherent. A targeted pass should (1) migrate inputs to `.input`, (2) fix the two dialog implementations to use `<DialogContent>` primitive, (3) fix the `bg-rose-500` button deviation. That cleanup alone removes ~80 lines of inline style debt without structural risk.

---

## 5. ConfirmProvider Analysis + Decision

**File:** `saas/components/ui/confirm-dialog.tsx`  
**Consumer count:** 26 files across `app/dashboard/` and `app/admin/`

### Current implementation quality

| Capability | Status |
|-----------|--------|
| Focus trap (Tab stays inside dialog) | ❌ Missing |
| Focus restoration after close | ❌ Missing |
| Scroll-lock | ❌ Missing |
| Portal (renders at document root) | ❌ Renders inline |
| Escape to close | ✓ `useEffect → keydown` |
| Enter to confirm | ✓ `keydown → settle(true)` |
| Click-outside to cancel | ✓ Overlay `onClick` |
| `role="dialog"` | ✓ |
| `aria-modal="true"` | ✓ |
| `aria-labelledby` | ✓ |
| z-index isolation | ✓ `z-[110]` |

### API (unchanged by any migration)

```typescript
const confirm = useConfirm();
const ok = await confirm({
  title: "...",
  message: "...",
  danger?: true,
  confirmLabel?: "...",
  cancelLabel?: "...",
});
```

The Promise-based API is excellent. It is the one part that must never change.

### Migration path

The internal `div.fixed.inset-0` implementation can be replaced with `<Dialog>` from `components/ui/primitives/dialog.tsx`. The public API at all 26 call sites stays identical — no consumer changes required.

### Decision: **MIGRATE LATER**

**Rationale:**
- The current implementation is functional and has never caused a reported bug
- 26 consumers means high blast radius if the migration introduces a regression
- The missing capabilities (focus trap, scroll-lock) are an a11y debt, not a live incident
- The `<Dialog>` primitive is newly introduced and needs production validation on simpler call sites first
- When ready: replace internals of `confirm-dialog.tsx` only — zero consumer changes

---

## 6. Radix Dependency Analysis

### Native `<select>` — 48 usages

All 48 are native HTML `<select>` elements. Styling is consistent: inline `bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm`. The browser-native select appearance renders a dropdown that matches the dark canvas reasonably on macOS/iOS.

**Verdict: DEFERRED.** Native select is keyboard-accessible. Styling is consistent via shared inline pattern. Radix Select adds substantial complexity (portal, popper, virtual focus) for marginal visual gain in this design system.

### Native `<input type="checkbox">` / `<input type="radio">` — 31 usages

All use `accent-emerald-500` or `accent-gold-500`. CSS `accent-color` gives the WKEYONE brand color in checked state on modern browsers (Chrome 93+, Firefox 92+, Safari 15.4+).

**Verdict: DEFERRED.** `accent-color` is sufficient. Radix Checkbox/Radio adds size/variant control and custom tick art, but the current implementation is functional and the gains don't justify the migration effort.

### Dropdown / Popover / Tooltip — 1 text reference

Only 1 occurrence of these component types in the dashboard. No systematic pattern requiring a shared primitive.

**Verdict: SKIP.** Not justified by usage volume.

### CSS Tabs (`limelight-tabs.tsx`) — 4 usages

Current implementation: CSS-only tab strip (`overflow-x-auto`, no JS). Keyboard behavior: no roving tabindex, no arrow-key navigation (Tab moves through all tabs individually, which is technically valid but not ideal).

**Verdict: DEFERRED.** 4 usages is a small surface. Radix Tabs would add roving tabindex + Home/End keys. Worthwhile in a dedicated batch, but not blocking.

### Radix packages to install in future batches

| Package | Trigger | Priority |
|---------|---------|----------|
| `@radix-ui/react-select` | When a settings page ships a redesigned form | Medium |
| `@radix-ui/react-tabs` | When `limelight-tabs.tsx` is next touched | Medium |
| `@radix-ui/react-checkbox` | When a form page ships styled checkboxes | Low |
| `@radix-ui/react-dropdown-menu` | When a context-menu pattern appears | Low |

---

## 7. Authenticated Dashboard Verification

**Status: UNKNOWN — no local test credentials available.**

Post-Phase-2C button consolidation (9 files migrated) was not browser-verified in the authenticated context. The TypeScript compiler confirmed 0 errors, and the CSS class semantics are equivalent (`.ai-btn-primary` and `.btn-primary` differ only in default padding, and all migrated call sites carried explicit `px-*` overrides).

**Risk level:** LOW. The migration was purely mechanical (string replace). No layout logic changed.

**Recommended action:** Verify 2-3 key dashboard pages (inbox, products, customers) on next staging deploy.

---

## 8. Visual Issues Found

| Issue | File | Severity | Status |
|-------|------|----------|--------|
| Dialog edge-to-edge at 375px | `components/ui/primitives/dialog.tsx` | High | FIXED (`w-[calc(100%-2rem)]`) |
| `broadcasts-ui.tsx` "حملة جديدة" button uses `bg-rose-500` instead of `.btn-primary` | `app/dashboard/broadcasts/broadcasts-ui.tsx:493` | Medium | NOT fixed (analysis-only phase) |
| Create modal panel uses `bg-slate-900` instead of `bg-canvas-raised` | `app/dashboard/broadcasts/broadcasts-ui.tsx:733` | Medium | NOT fixed (analysis-only phase) |
| 25+ form inputs in broadcasts page use raw inline styles instead of `.input` | `app/dashboard/broadcasts/broadcasts-ui.tsx:764+` | Low | NOT fixed (analysis-only phase) |

---

## 9. Intentionally NOT Changed

Per Phase 2B constraints (STRICT STOP CONDITION):

- `broadcasts-ui.tsx` — analysis only, no split, no refactor
- `ConfirmProvider` — decision made (MIGRATE LATER), no implementation
- No new Radix packages installed
- No Radix Select / Tabs / Checkbox added
- No authenticated dashboard pages touched
- No database changes
- Meta: not touched
- Bridge: not touched
- WhatsApp send pipeline: not touched
- DNS / Caddy: not touched
- Auth architecture: not touched

---

## 10. Remaining UNKNOWN

| Item | Notes |
|------|-------|
| Authenticated dashboard visual quality after Phase 2C | Needs staging verification |
| Mobile behavior of `ConfirmProvider` dialog | Not tested at 375px |
| `gsap` usage vs `framer-motion` — one may be dead | Not investigated |
| `broadcasts-ui.tsx` — whether Create modal trap is impacting users | No Sentry data checked |
| Keyboard navigation on `limelight-tabs.tsx` | Not tested with actual keyboard |

---

## 11. Recommended Next Implementation Batch

**Batch: Phase 2C — Broadcasts Targeted Fix** (≤ 5 files, no structural split)

Priority order:

1. **`broadcasts-ui.tsx` — dialog migration** (lines 731-1075)  
   Replace 2 inline `div.fixed.inset-0` patterns with `<DialogContent>` from `components/ui/primitives/dialog.tsx`. Gains: focus trap, Escape, scroll-lock, portal. Estimated: ~60 line diff.

2. **`broadcasts-ui.tsx` — button fix** (line 493)  
   Replace `bg-rose-500 hover:bg-rose-600 ...` with `<Button variant="primary">` or `className="btn-primary"`. 1-line change.

3. **`broadcasts-ui.tsx` — input class sweep** (lines 764-1059)  
   Replace inline `bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm ...` on each `<input>`/`<textarea>` with `className="input"`. Additive; no behavior change.

4. **`broadcasts-ui.tsx` — PageHeader adoption** (lines 477-499)  
   Replace inline title + desc block with `<PageHeader title="الحملات الإذاعية" description="..." actions={<Button ...>}>`.

5. **Admin dashboard staging verification** — after next deploy, browser-check 3 pages from Phase 2C migration list (inbox, products, customers).

**Do NOT do a big-bang rewrite. Each PR should touch ≤ 5 files.**

---

## Commits Included in This Batch

| File | Change |
|------|--------|
| `saas/app/globals.css` | Removed `.ai-btn-primary`, `.ai-btn-ghost`, focus-visible rule (dead CSS — 0 call sites) |
| `saas/app/admin/login/page.tsx` | Added `htmlFor`/`id` associations + `aria-label` on toggle button |
| `saas/components/ui/primitives/dialog.tsx` | Fixed mobile edge-to-edge: `w-full` → `w-[calc(100%-2rem)]` |
