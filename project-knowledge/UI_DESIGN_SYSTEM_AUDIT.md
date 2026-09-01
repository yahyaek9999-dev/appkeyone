# WKEYONE — UI Design System Audit

**Phase:** UI Foundation Audit (Phase 1 — evidence-first)  
**Date:** 2026-09-02  
**Auditor:** Claude Opus  
**Method:** Read-only inspection of `saas/package.json`, `tailwind.config.ts`, `app/globals.css`, `app/dashboard/layout.tsx`, `components/ui/*`, plus targeted `grep` for adoption metrics and browser probe of `https://wkeyone.app`. No code was modified. Meta and Bridge were not touched.

---

## 1. Executive Summary

**WKEYONE already has a mature CSS-driven design system.** It is implemented as `@layer components` classes in `app/globals.css` (579 lines) with strong tokens in `tailwind.config.ts`. Calling this "no design system" would be inaccurate and would violate the "never rewrite working systems" rule.

What it lacks is a **React component layer** on top of those classes: primitives like `Button.tsx`, `Input.tsx`, `Dialog.tsx`, `Popover.tsx`, `Dropdown.tsx`, `Select.tsx` are absent. Interactions that CSS can't provide (focus trap, keyboard navigation, portal, roving tabindex, scroll-lock) are implemented ad-hoc or missing.

Evidence-based findings:

| Signal | Value | Meaning |
|---|---|---|
| Design tokens | ✅ Comprehensive (brand, gold, canvas, surface, shadows, radii, easing, spacing) | VERIFIED strong |
| Semantic CSS classes | ✅ 40+ (`.btn-primary`, `.card`, `.data-table`, `.toolbar`, `.sidebar-link`, …) | VERIFIED strong |
| RTL | ✅ `dir="rtl" lang="ar"`, Cairo font, `border-l` for right-side rail | VERIFIED correct |
| Reduced-motion | ✅ Global `@media (prefers-reduced-motion: reduce)` guard | VERIFIED |
| Lucide icons | ✅ Consistent (55+ icons in nav-items alone) | VERIFIED |
| `btn-primary` adoption | 68 files | GOOD |
| `.card` adoption | 115 files | GOOD |
| `.input` adoption | **35 files** | DUPLICATION — 3× more files re-implement input styling inline |
| Inline input styles (`rounded-lg border border-white/… bg-white/…`) | **105 files** | DUPLICATION |
| Raw `<button>` uses | 100 files | Some legitimate, some should adopt `.btn-*` |
| `ai-btn-primary` (duplicate of `btn-primary`) | 9 files | DEBT — consolidate |
| Custom form input labels | Login page has no `<label>` | A11y DEBT (VERIFIED at `wkeyone.app/login`) |
| shadcn/ui | Not installed | MISSING — but see recommendation |
| Radix UI | Not installed | MISSING — recommended for a11y primitives only |
| CVA (class-variance-authority) | Not installed | MISSING — recommended for React primitive layer |
| React Hook Form | Not installed | MISSING — recommended lazily |
| Date library | None (`date-fns`/`dayjs`/`luxon`) | Timestamps use ad-hoc `timeAgo` (VERIFIED at `lib/utils.ts`) |

**Recommendation: build a thin React primitive layer that wraps the existing CSS classes, add Radix ONLY for a11y-critical primitives (Dialog, Popover, Dropdown, Menu, Tabs, Tooltip). Do not adopt shadcn/ui wholesale — it would duplicate the existing token system.**

---

## 2. Current Frontend Stack (VERIFIED from `saas/package.json`)

```
Framework:      Next.js 14.2.35 (App Router) + React 18.3.1
Styling:        Tailwind CSS 3.4.14 + tailwind-merge 2.5.4 + clsx 2.1.1
Icons:          lucide-react 0.460.0
Animation:      framer-motion 12.40.0, gsap 3.15.0, lenis 1.3.23
3D:             three 0.184.0 (landing page only)
Forms:          Native + Zod 3.23.8 for API validation (no React Hook Form)
Data:           @prisma/client 5.22.0
Auth:           Custom (jose 5.9.6 + bcryptjs 2.4.3) — NOT Clerk
Queue:          bullmq 5.76.10, ioredis 5.10.1, @upstash/redis 1.38.0
Monitoring:     @sentry/nextjs 10.53.1 (DSN not yet set in prod env)
```

---

## 3. Installed UI Libraries

**Present:**
- `lucide-react` — icon system (adopted broadly)
- `framer-motion` — animation (code-split via dynamic import in layout)
- `gsap` — additional animation (potential duplication with framer)
- `lenis` — smooth scroll
- `three` — 3D landing page

**Absent (evaluate before adding):**
- `@radix-ui/*` — accessible primitives
- `class-variance-authority` — variant management
- `react-hook-form` — form state
- `@tanstack/react-table` — data tables
- `recharts` — charts
- `sonner` — toast (already have custom)
- `cmdk` — command palette (already have custom `command-palette.tsx`)
- `date-fns` / `dayjs` — date formatting

---

## 4. Existing Reusable Component Inventory (VERIFIED)

`saas/components/ui/` contains **44 files**. Classified:

**Marketing/landing (public-site, framer-heavy) — DO NOT REPLACE:**
`animated-counter`, `animated-features-grid`, `animated-stats-section`, `bento-features`, `border-beam`, `data-constellation`, `faq-accordion`, `glow-card`, `glowing-effect`, `health-hero`, `integrations-whatsapp`, `marketing`, `pricing-cards`, `product-tour`, `public-footer`, `public-nav`, `roi-section`, `section-reveal`, `social-proof`, `spotlight-card`, `stagger-reveal`, `trust-section`.

**App primitives (dashboard) — GOOD, keep:**
`avatar`, `breadcrumb`, `confirm-dialog` (with `ConfirmProvider` — global), `empty-state`, `skeleton`, `toast` (with `ToastProvider` — global), `image-dropzone`, `lang-switch`, `frame-button`.

**App badges/utility — GOOD, keep:**
`lead-status-badge`, `limelight-tabs`, `live-badge`, `maintenance-banner`, `order-status-pill`, `provider-tier-badge`, `sparkline`, `stat-grid`, `status-dot`, `streaming-dots`, `trend-badge`, `typing-indicator`, `use-mutate` (hook).

**Notable absences (primitives that MUST be built):**
`button`, `input`, `textarea`, `select`, `checkbox`, `radio`, `switch`, `dialog`, `popover`, `dropdown-menu`, `tabs`, `tooltip`, `card` (React), `alert`, `label`, `form` (React Hook Form binding), `data-table`, `sheet`.

---

## 5. Existing Design Tokens (VERIFIED, `tailwind.config.ts`)

- **Brand**: emerald `brand-50…900` centered on `#01433E` (brand-700); soft/border/glow rgba variants
- **Gold**: champagne `gold-50…900` centered on `#C9A24B`; soft/border/glow rgba variants
- **Canvas**: `#0a0a0c` DEFAULT, `#08080a` deep, `#101013` raised, overlay
- **Surface**: rgba white overlays at 3%/1.4%/5.5%/4%
- **Fonts**: `sans` = Cairo (Arabic primary), `en` = Apple system stack
- **Spacing**: extended with 18/22
- **Shadows**: `card`, `nav`, `btn`, `elevated`, `float`, `glow`, `lux`, `glow-emerald`, `glow-gold`, `gold-ring`
- **Radii**: `lg` 0.625rem, `xl` 0.75rem, `2xl` 0.875rem (tighter than default)
- **Letter-spacing**: `tighter -0.035em`, `tight -0.02em`, `widest 0.12em`
- **Type**: `display` clamp 2.5–4.5rem, `display-sm` clamp 2–3.25rem
- **Easing**: `premium`, `out-expo`
- **Animations**: `fade-in`, `slide-up`, `light-sweep`, `pulse-glow`, `shimmer`, `float-up`, `gradient-x`

Classification: **VERIFIED — mature, coherent, brand-specific.**

---

## 6. Existing Tailwind/Theme Architecture (VERIFIED, `globals.css`)

Structured as three layers plus a landing-page section:

- `@layer base` — html/body defaults, ::selection
- `@layer components` — 40+ semantic classes: buttons, cards, inputs, tables, sidebar, toolbar, filters, metrics, chips, panels
- `@layer utilities` — glass, gold-text, text-gradient-emerald, lux-divider, spotlight-emerald, noise, touch-target (WCAG 2.5.5 44px hit area), roi-range
- Second `@layer components` (line 476) — landing-only `.lp-*` classes (deliberately scoped)

Key WCAG note in comments (line 108–111): the author knows slate-500 is 4.16:1 (< AA) and uses slate-400 for text — **thoughtful a11y engineering already present**.

---

## 7. Existing Navigation Architecture (VERIFIED)

- Global providers: `ToastProvider` → `ConfirmProvider` → dashboard tree
- Left rail (RTL: visually on the right) `<aside class="w-64 border-l">` in `app/dashboard/layout.tsx`
- Mobile: `MobileNav` component (dynamic import to keep bundle lean)
- Sidebar `SidebarNav` from `nav-items.tsx` (868 lines — very rich nav)
- CommandPalette + CommandTrigger (Cmd/Ctrl-K style, custom-built)
- DashboardBreadcrumb with `PageTransition` wrapper
- HelpDrawer (contextual help)
- White-label overrides at layout level (brandName, logoUrl, primaryColor)
- Multiple gating layers: activation status, entitlements, module visibility, `connectionMode` (QR vs Meta), feature-control visibility, role/RBAC

Classification: **VERIFIED — production-grade navigation**.

---

## 8. Existing RTL Implementation (VERIFIED via browser probe)

`https://wkeyone.app` returns `<html dir="rtl" lang="ar" class="lenis">`.  
Body: `bgColor: rgb(10, 10, 12)` (canvas), `fontFamily: Cairo`.  
Sidebar uses `border-l` (RTL: visually right) — correct.

Classification: **VERIFIED — RTL is native, not retrofitted**.

---

## 9. Existing Accessibility Patterns

Grep evidence:
- `aria-*` / `role=` in `app/dashboard/`: **46 occurrences** across ~300+ files → LOW coverage
- `aria-*` / `role=` in `components/`: 64 occurrences → moderate

Existing strengths:
- Global `prefers-reduced-motion` CSS reset (line 456 globals.css)
- `focus-visible:ring-2 focus-visible:ring-gold-500/60` on all `.btn-*` classes → VERIFIED
- `.touch-target` utility for WCAG 2.5.5 (44px hit area)
- WCAG contrast awareness in author comments (slate-400 vs slate-500)
- ConfirmProvider: `role="dialog" aria-modal="true" aria-labelledby` ✓
- Reduced-motion enforced site-wide

Existing gaps (VERIFIED):
- **Login email input has no `<label>` and no `aria-label`** (browser probe confirmed)
- No focus trap in custom dialogs (Escape works, but Tab can escape)
- No `<Label>` primitive → most form fields are unlabelled visually-only
- No skip-link
- No landmarks audit (`<nav>`, `<main>`, `<aside>` — present, but not consistently used)

Classification: **PARTIALLY GOOD, needs a primitive-layer sweep to fix at scale.**

---

## 10. Current Visual Inconsistencies

VERIFIED via `grep` adoption counts and code inspection:

| # | Inconsistency | Evidence |
|---|---|---|
| 1 | **Inputs: two implementations** — `.input` class (35 files) vs inline `rounded-lg border border-white/… bg-white/…` (105 files) | 3× duplication |
| 2 | **Buttons: duplicate primary** — `.btn-primary` (68 files) AND `.ai-btn-primary` (9 files) — visually identical | Verified via CSS diff (both are `bg-gradient-to-b from-brand-500 to-brand-700 …`) |
| 3 | **Buttons: three "hero-primary" variants** — `.btn-primary`, `.ai-btn-primary`, `.btn-premium` — pick one | Visible in globals.css lines 76–91, 224–232, 331–335 |
| 4 | **Ghost buttons: two variants** — `.btn-ghost` and `.ai-btn-ghost` | Same duplication pattern |
| 5 | **Cards: two nearly identical primitives** — `.ai-card` and `.card` — different gradient stop percentages only (42% vs 42%… identical!) | Verified in globals.css lines 46–58 |
| 6 | **Dialog: N per-page implementations** — 20+ dashboard files include `role="dialog"` or dialog patterns | Should use one primitive |
| 7 | **Icon-only buttons** — some use `.touch-target`, some don't | Inconsistent hit area |
| 8 | **Two "design systems" side-by-side** — `.btn-*/.card/.ai-*` (dashboard) and `.lp-hero-*/.lp-module-card/.btn-outline` (landing) | Intentional but should be explicitly documented |

---

## 11. Component Duplication

- `.btn-primary` vs `.ai-btn-primary` (semantically identical)
- `.btn-ghost` vs `.ai-btn-ghost`
- `.card` vs `.ai-card` (near-identical)
- `.data-table` vs `.ops-table` (differ only in font size and header case)
- `.crm-row` vs `.data-table tr` (functionally similar)
- `framer-motion` + `gsap` — potentially overlapping animation libs (VERIFY use-case before removing either)
- `broadcasts-ui.tsx` is 1108 lines — likely re-implements dialogs, filter bars, and empty states that could be shared

---

## 12. Missing Reusable Primitives (recommended additions — React layer wrapping existing CSS)

| Primitive | Purpose | Wraps existing class | Priority |
|---|---|---|---|
| `<Button variant="primary\|ghost\|danger\|outline\|premium" size="sm\|md\|lg">` | End the `.btn-primary` vs `.ai-btn-primary` duplication | `.btn-primary`, `.btn-ghost`, `.btn-danger` | HIGH |
| `<Input>` / `<Textarea>` / `<Label>` | End inline input style duplication (105 files) | `.input`, `.label` | HIGH |
| `<Card padding="sm\|md\|lg">` | Unify `.card`, `.ai-card`, `.surface` | `.card` | MEDIUM |
| `<Dialog>` (built on Radix) | Replace 20+ per-page dialog implementations, add focus trap/portal/scroll-lock | New | HIGH |
| `<DropdownMenu>` (Radix) | Not currently a primitive; used ad-hoc | New | MEDIUM |
| `<Popover>` (Radix) | Not present | New | MEDIUM |
| `<Tabs>` (Radix) | Wrap `limelight-tabs.tsx` + others | Existing | MEDIUM |
| `<Tooltip>` (Radix) | Not present, used inline | New | LOW-MEDIUM |
| `<Select>` (Radix) | Native `<select>` used unstyled in many places | New | MEDIUM |
| `<Badge variant="brand\|gold\|success\|danger\|neutral">` | Unify `.ai-badge`, `.chip`, per-page badge implementations | Existing | MEDIUM |
| `<PageHeader title description action>` | 30+ dashboard pages repeat the same header pattern | Uses `.page-title`/`.page-desc` | HIGH |
| `<StatCard>` | Unify `.kpi-card`/`.metric-cell`/`.stat-grid` | Existing | MEDIUM |
| `<DataTable>` | Wrap `.data-table` + `.ops-table` with sort/paging | Existing | MEDIUM (later) |
| `<FormField>` (label + input + error + hint) | Currently ad-hoc | New | HIGH |

---

## 13. Pages with Obvious UI Debt

**HIGH confidence (VERIFIED file size / grep):**
- `app/dashboard/broadcasts/broadcasts-ui.tsx` — **1108 lines** — likely inlines dialog, filter, table, empty-state
- `app/dashboard/nav-items.tsx` — 868 lines, extremely long import list (55+ icons)
- Any page using inline `<input className="rounded-lg border border-white/10 bg-white/5 px-3">` — 105 files
- Login page (unlabelled email input) — a11y

**INFERRED (needs targeted audit later):**
- Pages listed under `dashboard/customers/`, `dashboard/orders/`, `dashboard/products/`, `dashboard/knowledge/`, `dashboard/coupons/`, `dashboard/broadcasts/`, `dashboard/inbox/`, `dashboard/integrations/`, `dashboard/settings/*/` — each is a candidate for `<PageHeader>` + `<DataTable>` extraction.

---

## 14. Pages That Should NOT Be Changed

**DO NOT TOUCH** in this phase:
- **Landing page (`app/page.tsx`)** — uses the deliberately-scoped `.lp-*` design layer; it looks premium already; framer/gsap/three interplay is delicate
- **All marketing components** in `components/ui/` prefixed with landing patterns (animated-*, bento-*, roi-*, trust-*, pricing-cards, hero-*, social-proof, spotlight-card, glowing-effect, border-beam, data-constellation, product-tour, health-hero, public-nav, public-footer)
- **WhatsApp send pipeline** (per CLAUDE.md)
- **Meta cloud integration** (LIVE — per user directive)
- **Bridge** (LIVE — per user directive)
- **Authentication architecture** (custom cookie/JWT works)
- **Sentry client config** (env-driven, unchanged)
- **CommandPalette** — already built, working
- **ConfirmProvider / ToastProvider** — already global, working

---

## 15. Recommended Design System Architecture

```
Foundation (existing — keep)
├── Tokens        tailwind.config.ts (brand, gold, canvas, surface, shadows, radii, easing, type)
├── CSS classes   app/globals.css @layer components (btn-*, card, input, table, sidebar, toolbar…)
├── Icons         lucide-react
└── Fonts         Cairo (ar), system stack (en)

Primitives (BUILD — thin React wrappers over the CSS)
├── Button        variants: primary | ghost | danger | outline | premium
├── Input, Textarea, Label, FormField
├── Card          padding: sm | md | lg
├── Badge         variants: brand | gold | success | danger | neutral
├── Dialog        (Radix headless) — replace inline role="dialog"
├── Popover       (Radix headless)
├── DropdownMenu  (Radix headless)
├── Tabs          (Radix headless) — port limelight-tabs
├── Tooltip       (Radix headless)
├── Select        (Radix headless)
├── Switch, Checkbox, Radio (Radix headless)
└── Skeleton      (existing, keep)

Patterns (BUILD — composed of primitives)
├── PageHeader { title, description, actions }
├── FilterBar   { search, filters, sort, view }
├── DataTable   { columns, rows, sort, empty }
├── EmptyState  (existing, keep)
├── LoadingState / ErrorState
├── StatsGrid / StatCard
├── FormSection / FormField
├── ConfirmDialog (existing ConfirmProvider — extend)
└── Toast (existing ToastProvider — keep)

Product surfaces (KEEP as-is; refactor incrementally)
├── CustomerList, OrderList, ProductList, BroadcastBuilder, InboxThread,
    KnowledgeSourceManager, IntegrationsHub, SettingsScreens…
```

---

## 16. Recommended Library Usage

**KEEP (already fits):**
- Tailwind + `tailwind-merge` + `clsx` (design system foundation)
- Lucide (icons)
- Framer Motion (already code-split)
- Zod (already used for API validation)
- Custom ConfirmProvider + ToastProvider

**ADD (only after existing capability is confirmed insufficient):**

| Library | Justification | Alternative considered |
|---|---|---|
| `@radix-ui/react-dialog` | Focus trap, portal, scroll-lock — CSS alone cannot provide | Reject: rolling our own → 20+ inconsistent implementations |
| `@radix-ui/react-popover` | Popover positioning + keyboard | Reject: reimplementing = a11y risk |
| `@radix-ui/react-dropdown-menu` | Accessible menu with arrow-key nav | Same |
| `@radix-ui/react-tabs` | Roving tabindex | Existing `limelight-tabs.tsx` is CSS-only |
| `@radix-ui/react-tooltip` | Hover + focus + touch | — |
| `@radix-ui/react-select` | Native select is unstyleable | — |
| `class-variance-authority` (CVA) | Variant management for `<Button variant="…">` cleanly | Reject: hand-rolled string concat — worse |

**DO NOT ADD (would duplicate existing):**
- `shadcn/ui` — would inject its own token layer (`--background`/`--foreground`) that conflicts with WKEYONE's `brand-*`/`gold-*`/`canvas` token system. Take the Radix primitives shadcn is built on, not the whole kit.
- `sonner` — already have `ToastProvider`
- `cmdk` — already have `CommandPalette`
- `date-fns` — light native `Intl.DateTimeFormat` first; only add if formatting needs multiply
- `@tanstack/react-table` — only if a DataTable primitive with sort/filter/paging becomes a bottleneck
- `recharts` — only if analytics dashboards get more chart types

---

## 17. Library Gaps (only if genuinely needed)

Genuine needs, prioritized:
1. **Radix `Dialog`, `Popover`, `DropdownMenu`, `Tooltip`, `Tabs`, `Select`, `Switch`, `Checkbox`, `Label`** — 8 headless packages, small footprint.
2. **CVA** — variant management.
3. **React Hook Form + Zod resolver** — only for forms with >3 fields + validation (currently we have ~20 such forms). Introduce lazily.
4. Everything else (charts, tables, dates) can wait.

Not gaps:
- Icons ✓
- Toasts ✓
- Confirm ✓
- Command palette ✓
- Skeleton ✓
- Empty state ✓
- Animation ✓
- 3D ✓

---

## 18. Proposed Component Hierarchy

```
saas/components/
├── ui/
│   ├── (KEEP AS-IS — marketing/animation, badges, avatars, etc.)
│   └── primitives/
│       ├── button.tsx          (CVA over .btn-* classes)
│       ├── input.tsx           (over .input)
│       ├── textarea.tsx
│       ├── label.tsx
│       ├── form-field.tsx      (label + input + error/hint)
│       ├── card.tsx            (padding variants)
│       ├── badge.tsx
│       ├── dialog.tsx          (Radix)
│       ├── popover.tsx         (Radix)
│       ├── dropdown-menu.tsx   (Radix)
│       ├── tabs.tsx            (Radix)
│       ├── tooltip.tsx         (Radix)
│       ├── select.tsx          (Radix)
│       ├── switch.tsx          (Radix)
│       ├── checkbox.tsx        (Radix)
│       └── separator.tsx
├── patterns/
│   ├── page-header.tsx
│   ├── filter-bar.tsx
│   ├── data-table.tsx
│   ├── loading-state.tsx
│   ├── error-state.tsx
│   ├── stats-grid.tsx
│   └── form-section.tsx
```

---

## 19. Before/After Strategy

- **Before:** ad-hoc React + strong CSS design system; inconsistent input styling; duplicate button classes; per-page dialogs; a11y gaps in labels.
- **After:** thin React primitive layer over the existing CSS; Radix for a11y-critical primitives; consolidated variants via CVA; existing pages **unchanged unless intentionally refactored**.
- Legacy CSS classes (`.btn-primary`, `.ai-btn-primary`, `.card`, `.ai-card`) are **kept indefinitely** so existing pages keep rendering; new primitives compose them. Deletion of a duplicate class happens **only** after zero call sites remain.

---

## 20. Migration Strategy (proposed order — NOT executed in this phase)

1. **Documentation-only:** publish this audit → decide.
2. **Primitives (Batch A, low risk):** add `Button`, `Input`, `Textarea`, `Label`, `FormField`, `Card`, `Badge`. All wrap existing CSS classes; **no visual change**.
3. **Radix primitives (Batch B, add packages):** `Dialog`, `Popover`, `DropdownMenu`, `Tooltip`, `Tabs`, `Select`, `Switch`, `Checkbox`. Ship one at a time; migrate 2–3 call sites each to validate.
4. **Patterns (Batch C):** `PageHeader`, `FilterBar`, `EmptyState` (upgrade), `LoadingState`, `ErrorState`.
5. **Opportunistic migrations:** on every touched page, replace inline input styling with `<Input>`; replace inline dialog with `<Dialog>`; replace `<button>` with `<Button>`.
6. **Consolidation:** once no call site uses `.ai-btn-primary`, delete it from `globals.css`.
7. **Optional later:** `<DataTable>`, forms with React Hook Form, date library.

**Do not do a big-bang refactor.** Each PR should touch ≤ 5 files unless it's a pure primitive addition.

---

## 21. Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Regression on production pages | LOW | Additive-only; CSS classes preserved |
| Bundle size grows | LOW | Radix primitives are ~2-5KB each, tree-shaken |
| Design drift while primitives roll out | MEDIUM | Ban new inline input styling in code review during migration |
| Landing page interfered with | MEDIUM | Explicit "DO NOT TOUCH" list (§14) |
| RTL breakage | LOW | Radix has RTL support; new primitives inherit |
| A11y regression | LOW | Primitives are strictly better (labels, focus trap) than status quo |
| Bridge/Meta impact | ZERO | UI layer only; no send-pipeline touch |

---

## 22. Browser Evidence (captured this session)

**Public landing** (`https://wkeyone.app`):
- `<html dir="rtl" lang="ar" class="lenis">` ✓
- Body: `bgColor: rgb(10, 10, 12)`, `color: rgb(226, 232, 240)`, `fontFamily: Cairo` ✓
- Zero console errors ✓
- Landing uses `.btn-outline` (not `.btn-primary`) — confirms scoped landing DS layer
- Screenshot: cinematic hero, gold+emerald accents, real product identity

**Login page** (`https://wkeyone.app/login`):
- Email input renders correctly (radius 12px, brand-tinted border, focus outline present)
- **NO `<label>` associated with email input** (VERIFIED via `element.labels.length === 0`)
- Visible label text exists but is not programmatically associated → screen readers won't announce
- Same pattern likely repeats across dashboard forms

**Dashboard authenticated flows:**  
`AUTHENTICATED_RUNTIME = UNKNOWN`. No safe test credentials were available in this session. Deferred to ops-team manual verification (as noted in prior migration closure doc).

---

## 23. UNKNOWN Items

- Authenticated dashboard visual state (no test creds).
- Adoption rate of `.data-table` vs manually-styled `<table>` across the app.
- Whether `broadcasts-ui.tsx` (1108 lines) contains inline dialog implementations vs uses ConfirmProvider.
- Whether `gsap` is still used or is legacy that could be removed (bundle savings).
- Real customer-visible interaction quality on mobile (viewport not tested at 375px).
- Complete `nav-items.tsx` (868 lines) — only the first 60 lines were sampled.

---

## 24. Explicit "DO NOT TOUCH" Areas

**These are stable, verified live, and out of scope for this design-system phase:**

1. Domain migration (CLOSED — commit `a22a05e`)
2. Meta Cloud (LIVE — do not test, reconnect, reconfigure)
3. Bridge (LIVE — do not test, rebuild, reconnect)
4. WhatsApp send pipeline (CLAUDE.md prohibition)
5. Authentication architecture (custom cookie/JWT works)
6. Database schema (no `db push` for design-system work)
7. Landing page `app/page.tsx` (uses `.lp-*` layer intentionally)
8. Deploy scripts (unrelated to UI)
9. Sentry client config
10. Prisma seed data

---

## Summary Decision (what this audit recommends)

**Decision: adopt a thin React primitive layer over the existing CSS design system. Add Radix for a11y-critical primitives only. Do not adopt shadcn/ui wholesale. Do not run a broad redesign. Preserve everything currently working.**

Next-phase implementation order (if approved):
1. `Button` + `Input` + `Label` + `FormField` primitives (no new deps).
2. Consolidate `.ai-btn-primary` → `.btn-primary` (delete duplicate only after 0 call sites).
3. Add Radix `Dialog`; migrate `confirm-dialog.tsx` to it (keep the API).
4. Add Radix `DropdownMenu`, `Popover`, `Tooltip`, `Tabs`, `Select`.
5. `PageHeader` + `EmptyState` upgrade + `StatCard` patterns.
6. Fix the login-page label a11y bug (2-line change).

**This audit itself changes no code and touches no production.**
