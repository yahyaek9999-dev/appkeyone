# WKEYONE — UI Design System Phase 2C
## Broadcasts Targeted Cleanup

**Date:** 2026-09-02  
**Branch:** claude/domain-migration-inventory-b12e5a  
**Based on:** Phase 2B analysis (`project-knowledge/UI_DESIGN_SYSTEM_PHASE_2B.md`)  
**Analyst/Implementor:** Claude Sonnet 4.6  
**File touched:** `saas/app/dashboard/broadcasts/broadcasts-ui.tsx` (1109 lines — unchanged count)

---

## A. Dialog #1 — Create Modal (before/after)

**Before:**
```tsx
{creating && (
  <div className="fixed inset-0 bg-black/70 backdrop-blur z-50 flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-rose-400" /> حملة جديدة
        </h3>
        <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>
      {/* form content */}
      <div className="flex justify-end gap-2 mt-6">
        <button onClick={() => setCreating(false)} className="...">إلغاء</button>
        <button className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 ...">إطلاق الحملة</button>
      </div>
    </div>
  </div>
)}
```

**After:**
```tsx
<Dialog open={creating} onOpenChange={(open) => { if (!open) setCreating(false); }}>
  <DialogContent
    className="max-w-2xl max-h-[90vh] overflow-y-auto p-6"
    onInteractOutside={(e) => e.preventDefault()}
  >
    <DialogHeader className="mb-4">
      <DialogTitle className="flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-rose-400" /> حملة جديدة
      </DialogTitle>
    </DialogHeader>
    {/* form content — unchanged */}
    <DialogFooter className="mt-6">
      <DialogClose asChild>
        <button className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm">إلغاء</button>
      </DialogClose>
      <button className="btn-primary disabled:opacity-50 inline-flex items-center gap-2">إطلاق الحملة</button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Behavior changes:**

| Behavior | Before | After |
|----------|--------|-------|
| Focus trap | ❌ None | ✓ Radix managed |
| Escape to close | ❌ None | ✓ Radix managed → `setCreating(false)` |
| Scroll-lock | ❌ None | ✓ Radix `overflow:hidden` on body |
| Portal | ❌ Inline DOM | ✓ Renders at document root |
| Click-outside closes | ❌ Absent | ❌ Prevented (`onInteractOutside`) — PRESERVED: original had no click-outside |
| `role="dialog"` | ❌ None | ✓ Radix adds automatically |
| `aria-modal` | ❌ None | ✓ Radix adds automatically |
| `aria-labelledby` | ❌ None | ✓ Wired to `<DialogTitle>` |
| Open/close state | `{creating && (...)}` | `open={creating}` prop |
| Submit closes dialog | ✓ `setCreating(false)` | ✓ Same — prop change triggers Radix close |
| Cancel button | `onClick={() => setCreating(false)}` | `<DialogClose asChild>` — equivalent |

**Note on click-outside:** The original Create modal had NO click-outside-closes behavior (overlay had no `onClick`). This is intentional — the form has many inputs and accidental dismissal would lose user's draft. `onInteractOutside={(e) => e.preventDefault()}` preserves this.

---

## B. Dialog #1 Browser Evidence

- Dev server compiled `broadcasts-ui.tsx` with 0 errors: **VERIFIED**
- TypeScript `tsc --noEmit`: **0 errors** ✓
- No console errors in dev server logs related to broadcasts: **VERIFIED**
- Authenticated dashboard view: **BLOCKED** — no local test credentials available (pre-existing limitation)
- Production build: **BLOCKED** — OOM at 1.9 GB heap (pre-existing machine limitation; not caused by this change)

---

## C. Dialog #2 — Edit Modal (before/after)

**Before:**
```tsx
{editing && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
       onClick={() => setEditing(null)}>
    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
         onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h2 ...><Pencil .../> تعديل الحملة</h2>
        <button onClick={() => setEditing(null)} ...><X .../></button>
      </div>
      {/* form content */}
      <div className="flex justify-end gap-2 mt-6">
        <button onClick={() => setEditing(null)} ...>إلغاء</button>
        <button className="... bg-rose-500 hover:bg-rose-600 ...">حفظ التعديلات</button>
      </div>
    </div>
  </div>
)}
```

**After:**
```tsx
{editing && (
  <Dialog open onOpenChange={(open) => { if (!open) setEditing(null); }}>
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-6">
      <DialogHeader className="mb-4">
        <DialogTitle className="flex items-center gap-2">
          <Pencil className="w-4 h-4" /> تعديل الحملة
        </DialogTitle>
      </DialogHeader>
      {/* form content — unchanged */}
      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <button className="...">إلغاء</button>
        </DialogClose>
        <button className="btn-primary disabled:opacity-50 inline-flex items-center gap-2">
          حفظ التعديلات
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)}
```

**Note on conditional mount:** The Edit Dialog is conditionally mounted `{editing && (...)}` because `editing` is `Bc | null`. If the Dialog were always rendered with `open={Boolean(editing)}`, TypeScript could not narrow `editing` to `Bc` inside the content (it knows `editing` might be null). The `{editing && (...)}` guard narrows the type within the block. Trade-off: the exit animation does not play (component unmounts immediately when `setEditing(null)` is called). This is acceptable — the open animation still plays.

**Behavior changes:**

| Behavior | Before | After |
|----------|--------|-------|
| Focus trap | ❌ None | ✓ Radix managed |
| Escape to close | ❌ None | ✓ Radix → `setEditing(null)` |
| Scroll-lock | ❌ None | ✓ Radix |
| Portal | ❌ Inline DOM | ✓ Document root |
| Click-outside closes | ✓ `onClick` on overlay | ✓ Radix default — equivalent |
| `stopPropagation` on inner div | ✓ Manual | ✓ Radix handles internally |
| `role="dialog"` | ❌ None | ✓ Radix |
| Exit animation | n/a (no animation before) | Not played (conditional mount) |

---

## D. Dialog #2 Browser Evidence

Same as Dialog #1 — compilation confirmed clean, authenticated view blocked.

---

## E. Danger Button Migration

**Finding:** Three `bg-rose-500` buttons existed in the file:

| Location | Text | Semantic role | Action taken |
|----------|------|---------------|--------------|
| Line 498 (page header) | "حملة جديدة" | Primary action — create new campaign | MIGRATED → `btn-primary` |
| Create modal footer (line ~993) | "إطلاق الحملة / جدولة / A/B" | Submit form — create campaign | MIGRATED → `btn-primary` |
| Edit modal footer | "حفظ التعديلات" | Submit form — save edits | MIGRATED → `btn-primary` |

**Semantic verdict:** None of these buttons are destructive actions. Rose/red semantics = danger/destructive. "Launch campaign", "Schedule campaign", and "Save edits" are all positive create/save actions. The correct token is `btn-primary` (emerald).

**Preserved:** Rose color is intentionally used in STATUS_BADGE for `canceled` status (correct — canceled = danger state), the A/B campaign type selector tab (`border-rose-500/40 bg-rose-500/15`), and the `<Megaphone>` icon tint (`text-rose-400`) — these are domain color accents, not button variants, and were NOT changed.

**Before (page header):**
```tsx
className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white inline-flex items-center gap-2 text-sm"
```

**After:**
```tsx
className="btn-primary inline-flex items-center gap-2"
```

**Visual change:** Button color changes from rose/red to emerald (brand green). This is the correct brand-system button for a primary positive action.

---

## F. Input Migration

**Scope:** Only inputs inside the two dialog modals (Create + Edit). No other pages touched.

**`.input` class definition:**
```css
.input {
  @apply w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-white
         placeholder-slate-500 outline-none transition-all duration-200
         focus:border-brand-400/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-brand-500/20;
}
```

**Migrated inputs (Create modal):**

| Input | Before class | After class |
|-------|-------------|-------------|
| Campaign title | `w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500` | `input` |
| Audience select | same pattern | `input` |
| Date from | `w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm` | `input` |
| Date to | same | `input` |
| AI generator — product | `bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm` | `input` |
| AI generator — offer | same | `input` |
| Message template (textarea) | `w-full bg-white/5 ... resize-none` | `input resize-none` |
| Coupon code | `w-full bg-white/5 ...` | `input` |
| Image URL (dir="ltr") | same | `input` (kept `dir="ltr"`) |
| Schedule datetime-local | `bg-white/5 ... px-3 py-1.5 text-sm` | `input w-auto` (auto width — not full-width in flex row) |

**Migrated inputs (Edit modal):**

| Input | After class |
|-------|-------------|
| Edit title | `input` |
| Edit template (textarea) | `input resize-none` |
| Edit coupon | `input` |
| Edit image URL (dir="ltr") | `input` (kept `dir="ltr"`) |
| Edit scheduled datetime-local | `input` |

**Visual difference from migration:**
- `rounded-xl` (up from `rounded-lg`) — slightly more rounded corners
- `px-3.5 py-2.5` (up from `px-3 py-2`) — 1.5px more horizontal, 2px more vertical padding
- Focus: ring-2 + brand-400/60 border (up from outline-none + border-brand-500) — richer focus state
- `transition-all duration-200` added — smooth hover/focus transitions
- `placeholder-slate-500` added — standardizes placeholder color

All behavior (value, onChange, type, disabled, placeholder, autocomplete, form validation) was preserved exactly.

**Exceptions — NOT migrated:**

| Input | Reason |
|-------|--------|
| `inactiveDays` number input (line ~797) | `w-20` fixed-width counter in inline label — `.input` includes `w-full` which would break the layout |
| `templateB` A/B textarea (line ~871) | Uses `border-brand-500/20` as a visual A/B-mode differentiator (distinct from main template textarea) — migrating would lose this intentional visual cue |

---

## G. Behavior Preserved

- **Open/close state:** `creating` and `editing` state variables are unchanged — same `useState` usage
- **Form validation:** All `disabled` conditions on submit buttons unchanged
- **Loading spinners:** `{submitting ? <Loader2 ...> : ...}` patterns unchanged
- **Error handling:** `useToast` calls in `submit()`, `submitEdit()`, `submitAb()` unchanged
- **Business logic functions:** `submit()`, `submitEdit()`, `submitAb()`, `optimize()`, `generate()` — all unchanged
- **A/B mode toggle:** `abMode` state and UI unchanged
- **Audience selection logic:** `inactive` days and `date_range` conditional inputs unchanged
- **Personalization radio buttons:** unchanged
- **Cancel button behavior:** Functionally equivalent — `<DialogClose asChild>` calls `onOpenChange(false)` which sets the state variable to `false`/`null`, same as the previous `onClick` handlers
- **RTL layout:** All Arabic text, RTL direction, and Cairo font preserved. `dir="ltr"` kept on URL/email inputs
- **`UpgradeModal`:** unchanged
- **`useConfirm` in `cancel()` and `remove()`:** unchanged
- **List area:** unchanged (lines 501-736)

---

## H. Visual Differences

| Element | Before | After | Classification |
|---------|--------|-------|----------------|
| "حملة جديدة" button | Rose/red (`bg-rose-500`) | Emerald (`btn-primary`) | INTENTIONAL — design-system correction |
| Dialog submit buttons | Rose/red | Emerald | INTENTIONAL — design-system correction |
| Dialog panel background | `bg-slate-900` | `bg-canvas-raised` | INTENTIONAL — token correction |
| Dialog panel corners | `rounded-2xl` | `rounded-xl` (from DialogContent base) | MINOR — 1 step less rounding |
| Dialog panel padding | `p-6` | `p-6` (passed via className, overrides base `p-5`) | PRESERVED |
| Input corners | `rounded-lg` | `rounded-xl` | MINOR — 1 step more rounding |
| Input padding | `px-3 py-2` | `px-3.5 py-2.5` | MINOR — slightly taller inputs |
| Input focus ring | `focus:border-brand-500` | `focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400/60` | IMPROVEMENT — richer focus indicator |
| Dialog backdrop | `bg-black/70 backdrop-blur` (stronger blur) | `bg-black/60 backdrop-blur-sm` (from DialogOverlay) | MINOR — slightly softer backdrop |
| Dialog close button | Inline X in header | DialogContent built-in X at `absolute left-4 top-4` | MINOR — position preserved (RTL: visually top-right) |

---

## I. Exceptions

| Item | Decision | Reason |
|------|----------|--------|
| `inactiveDays` input | NOT migrated | Fixed `w-20` conflicts with `.input`'s `w-full` |
| `templateB` A/B textarea | NOT migrated | `border-brand-500/20` is an intentional A/B visual differentiator |
| `<select>` elements | NOT migrated | Outside the `<input>` migration scope for this phase; Radix Select deferred |
| Edit modal exit animation | NOT present | Conditional mount pattern required for TypeScript narrowing; trade-off accepted |
| Inline button-style toggles (schedule mode, A/B tabs, gen type chips) | NOT migrated | These are domain-specific toggle chips, not form inputs |

---

## J. Tests

- **TypeScript (`tsc --noEmit`):** 0 errors before changes, 0 errors after all changes ✓
- **Unit/integration tests:** No test files found for `broadcasts-ui.tsx` in the codebase
- **Dev server compilation:** Clean — no errors in server logs after loading the route ✓

---

## K. Browser Verification

| Check | Method | Result |
|-------|--------|--------|
| TypeScript validity | `tsc --noEmit` | ✓ 0 errors |
| Dev server compilation | Server logs after route fetch | ✓ No errors |
| Authenticated broadcasts page | Browser (dashboard) | ❌ BLOCKED — no local credentials |
| Create dialog open/close | Browser | ❌ BLOCKED — requires auth |
| Edit dialog open/close | Browser | ❌ BLOCKED — requires auth |
| Mobile 375px | Browser | ❌ BLOCKED — requires auth |
| Production build | `next build` | ❌ BLOCKED — OOM at 1.9 GB heap (pre-existing) |

**Risk assessment:** LOW. Changes are structural replacements of `div.fixed.inset-0` with `<Dialog>` from Radix (proven primitive). TypeScript catches all API mismatches. Business logic (state, handlers, API calls) was not modified. The only behavioral additions are focus trap, Escape, scroll-lock, and portal — all additive, non-breaking.

---

## L. Remaining UI Debt

| Debt | Location | Priority |
|------|----------|----------|
| `templateB` textarea not using `.input` | broadcasts-ui.tsx ~line 871 | Low — intentional exception |
| `inactiveDays` counter input not using `.input` | broadcasts-ui.tsx ~line 793 | Low — intentional exception |
| All `<select>` elements in broadcasts page | broadcasts-ui.tsx ~lines 774+ | Medium — Radix Select deferred |
| Form labels without `htmlFor`/`id` | broadcasts-ui.tsx (all labels) | Medium — a11y debt |
| PageHeader primitive not adopted | broadcasts-ui.tsx lines 484-506 | Low — inline title/desc still works |
| `Metric` and `OptRow` not extracted | broadcasts-ui.tsx lines 1088-1109 | Low — works fine as file-local |
| Edit modal exit animation absent | broadcasts-ui.tsx | Very low — conditional mount trade-off |

---

## M. Remaining UNKNOWN

| Item | Status |
|------|--------|
| Authenticated dashboard visual quality after all button + dialog changes | UNKNOWN — no local credentials |
| Whether `bg-canvas-raised` == `bg-slate-900` visually on production | INFERRED equal (both near-black dark surface) |
| Mobile 375px dialog behavior with Radix (max-w-2xl + w-[calc(100%-2rem)]) | INFERRED correct — tested in Phase 2B with max-w-sm; same calc applies |
| Focus restoration to "حملة جديدة" button after Create modal closes | INFERRED correct — Radix manages focus return to trigger element |

---

## Next Recommendation

**STOP here per Phase 2C stop condition.**

Issues to address in the next batch (do NOT start automatically):

1. **Authenticated staging verification** — deploy to staging and browser-verify the 3 changed surfaces (header button, create dialog, edit dialog) at desktop + 375px + RTL
2. **Broadcasts form a11y** — add `htmlFor`/`id` associations to all 10+ label+input pairs in broadcasts-ui.tsx (same pattern as login pages)
3. **ConfirmProvider → Radix migration** — 26 consumers, API unchanged, internal replacement only (per Phase 2B decision: MIGRATE LATER)

---

## Summary

| Category | Count |
|----------|-------|
| Files touched | 1 (`broadcasts-ui.tsx`) |
| Dialog migrations | 2 (Create + Edit) |
| Button migrations | 3 (`bg-rose-500` → `btn-primary`) |
| Input migrations | 15 |
| Input exceptions documented | 2 |
| TypeScript errors introduced | 0 |
| Business logic changes | 0 |
| API/DB changes | 0 |
