# Phase 11 — WKEYONE User Dashboard Human-Design Transformation

**Date:** 2026-09-03
**Branch:** `claude/wkeyone-dashboard-design-098c24`
**Baseline:** `8b5eba4` (the live production commit, after reconciliation — see §21)
**Scope:** Customer (merchant) dashboard UI/UX only. No Meta, no Bridge, no billing,
no auth, no infrastructure, no migrations, no deploy.

---

## 1. Screenshot evidence inventory

**Source:** `~/Desktop/Archive.zip` — 74 PNG screenshots captured 2026-09-03
17:51–17:57 against the live user dashboard, signed in as the
`KEYONE Enterprise` test account (`test1 / test@wkeyone.com`). Native
resolution 3360×2100 (retina, ~1680×1050 CSS px).

**How they were inspected — stated precisely:**

| Method | Count | Detail |
|---|---|---|
| Individually opened | 74 / 74 | Every screenshot was opened and read one at a time |
| At full native resolution | 0 | None were opened at 3360×2100 |
| At 860px downscale | 74 | Sequenced by capture time (`01`–`74`), downscaled with `sips -Z 860` |

At 860px wide, page **composition, hierarchy, density, whitespace distribution,
card counts, and focal points** are all clearly legible — which is what this
phase is about. Body microcopy at 10–11px is **not** reliably legible at that
scale; where copy mattered, it was read from source instead. No claim in this
report rests on text read from a downscaled screenshot.

Contact sheets were **not** used (ImageMagick/Pillow unavailable on the host);
every screenshot got its own read.

## 2. Screenshot clusters

Grouped by the composition problem they exhibit, not by workspace:

| # | Cluster | Screenshots | Routes |
|---|---|---|---|
| **C1** | **The lonely box in a void** — title, tiny sub, one bordered rectangle with a 56px centred icon badge, ~65% empty canvas below | 05, 07, 13, 14, 15, 16, 17, 18, 20, 22, 26, 35, 40, 55, 67, 71, 72, 73, 74 (19) | escalations, settings/numbers, leads, customers, products, orders, coupons, shipments, broadcasts, recovery, sms/log, bot-builder, flow-builder, suggestions, wallet, integrations, teams, branches, approvals |
| **C2** | **Flat KPI strip** — 3–5 identically weighted bordered boxes, big number + tiny label, no anchor | 02, 10, 13, 41, 42, 44, 45, 46, 49, 50, 51, 53, 56, 69 (14) | my-work, compliance, leads, agents, ai-operations, brain, analytics, command-center, revenue-forecast, business, revenue-pro, sales-brain, monitoring, wallet |
| **C3** | **Card wall** — 4–9 near-identical cards, each with the same icon tile in the same corner | 12 (9 cards + 36 nested boxes), 23 (4), 57 (4), 61/71 (5), 08/63 (4) | segments, sms, export, settings/providers, settings/bridge |
| **C4** | **Weak page opening** — 20–22px title over an equally-sized description, primary action detached in the far corner, no context | ~all 74 | every route |
| **C5** | **Already strong — leave alone** | 01 (dashboard home), 37 (knowledge), 38 (knowledge-brain), 39 (working-hours), 43 (ai-audit), 62 (meta-cloud), 68 (usage), 69 (wallet) | dashboard, knowledge, knowledge-brain, working-hours, ai-audit, settings/meta-cloud, usage |

## 3. Systemic visual findings

The 74 screenshots are not 74 problems. They are **four** problems repeated 74
times, all of which live in shared code:

1. **`.page-title` was 20–22px against a 14px `.page-desc`** — a ~1.6:1 ratio.
   A page title needs to *be* the page's subject; at that ratio it floated
   above the content instead of anchoring it. 139 files render this class.

2. **`EmptyState` had exactly one composition** — centred, giant icon badge,
   heading, one grey line. Used on 27 files. It said *something is missing* but
   never *why it matters* or *what to do*, and its ~180px height inside a
   ~760px content column is the direct mechanical cause of the black void that
   dominates 19 screenshots.

3. **The operational vocabulary already existed and was unused.** `globals.css`
   defines `.metric-band-cell`, `.attention-item`, `.ops-table`, `.crm-row`,
   `.metric-group` — a real B2B-operations register, written in a previous
   pass. Actual usage across `app/dashboard`: **0, 0, 0, 0, and 1**. Every page
   fell back to the generic `.card` (72 files) and `.kpi-card`. The product was
   not missing a design language; it was not using the one it had.

4. **Nothing was ever ranked.** KPI rows, card grids, action clusters, table
   columns — all rendered at equal weight. With no anchor the eye lands
   nowhere, so a merchant scans everything or nothing.

A fifth finding, discovered while working, is recorded in §11.

## 4. WKEYONE design DNA

**Preserved, untouched:** emerald `#01433E` (`brand-*`), champagne gold
(`gold-*`), the near-black `canvas` / `canvas-deep` ground, Cairo, RTL-first
logical properties, all existing tokens, the rail + contextual-panel shell,
`nav-items.tsx` and its 8-workspace model, ⌘K palette, all Arabic terminology,
whole-EGP money.

**Changed:** the *composition* register only — type scale, surface hierarchy,
metric ranking, empty-state semantics, and the card-wall pattern.

No new dependency, no new colour, no font change, no navigation change.

## 5. Canva availability

Canva MCP **was connected and reachable** in this session. It was queried
twice:

- `search-designs` — `{"query": "SaaS dashboard operations table hierarchy",
  "ownership": "any"}` → `{"items":[]}`
- `search-brand-templates` — `{"query": "dashboard"}` → `{"items":[]}`

## 6. Actual Canva usage

**None.** The connected account contains zero designs and zero brand
templates, so there was nothing to inspect. The available toolset is design
*creation and management* in the user's own account, not a reference library —
generating a Canva design and then "extracting principles" from my own output
would be circular and is not evidence.

**No Canva-derived reference informed any decision in this phase.**

## 7. Canva design principles extracted

**None** — see §6. The design decisions in §8–§11 derive from: the 74
screenshots, the existing WKEYONE token system and its unused operational
vocabulary, and general B2B SaaS composition principles (rank before decorate;
one surface beats N borders; whitespace needs a job).

## 8. Global patterns changed

### P1 — Page type scale (`app/globals.css`)

```
.page-title   text-xl sm:text-[22px]        →  text-[24px] sm:text-[28px], leading-[1.18]
.page-desc    text-sm text-slate-400        →  text-[13px] max-w-[68ch] leading-relaxed
```

Title→description ratio moves from ~1.6:1 to ~2.2:1, and the description gets a
measure so it reads as a subtitle rather than a second body paragraph. **This
one change lands on all 139 files that use the classes**, including the 45
admin pages (out of scope for this phase, but purely typographic and an
improvement — noted, not hidden).

### P2 — `EmptyState` rebuilt (`components/ui/empty-state.tsx`)

Two axes instead of one shape:

- `variant="inline"` *(default — every untouched call site keeps working)*:
  the familiar centred state, refined. The 56px icon badge drops to a quiet
  32px glyph; type scale tightened.
- `variant="page"`: the screen's primary surface. Start-aligned, its own quiet
  hairline surface, `min-h: clamp(320px, 42vh, 460px)`, and slots for
  `hint` (why it matters), `action` + `secondaryAction`, and a 3-up `steps`
  strip.
- `tone="clear"`: for pages where **zero is the good answer** (escalations at
  zero, no churn risk, no anomalies). Emerald glyph, shorter
  (`clamp(200px, 26vh, 300px)`), **no CTA**, and the `steps` strip re-reads as
  *the rules that govern this page* (unnumbered) instead of *things to do*.
  This distinction matters: dressing a healthy zero as an activation nag
  teaches merchants to distrust the signal.

### P3 — `PageHeader` + `HeaderFact` (new, `components/ui/page-header.tsx`)

Eyebrow → dominant title → subordinate description → inline hairline-separated
`meta` facts → ranked `secondary` / `action` cluster. The `meta` row exists
specifically so pages whose only numbers are "3 / label" stop spending a whole
KPI band on them.

### P4 — `MetricBand` + `Metric` (new, `components/ui/metric-band.tsx`)

One surface, `gap-px` hairline dividers, and **at most one `anchor` cell**
(wider, 30–34px value, tone-coloured, start-edge rule, room for a context
line). Explicitly not a KPI factory: with no anchor it renders as an evenly
weighted reference row, which is the honest presentation when no metric leads.
Never invent an anchor.

## 9. Routes changed

| Route | Change |
|---|---|
| `/dashboard` | Revenue anchors the performance band (was 4 × 28px equal cells) |
| `/dashboard/orders` | `PageHeader`; revenue `MetricBand` anchor; page-variant activation state; row currency aligned |
| `/dashboard/customers` | `PageHeader`; **new relationship-value column** (spend + order count, one `groupBy`); page-variant activation state; row hover |
| `/dashboard/products` | `PageHeader` + meta facts; page-variant activation state with 3 steps |
| `/dashboard/inbox` | Zero-conversation state replaces the double empty state (see §11) |
| `/dashboard/segments` | Card wall (9 cards / ~50 borders) → one operational list, sorted by size |
| `/dashboard/export` | 4 tinted CTA cards → a table where record count leads |
| `/dashboard/sms` | 4 identical icon cards → ordered setup path |
| `/dashboard/settings/providers` | 5 identical cards → status-first list ("غير مربوط" now visible) |
| `/dashboard/analytics` | Messages anchors the band — the metric the chart below actually explains |
| `/dashboard/my-work` | 3 equal centred numbers → escalations anchored |
| `/dashboard/escalations` | `tone="clear"` + rules strip |
| `/dashboard/recovery` | `tone="clear"` + signal-types strip |
| `/dashboard/approvals` | `tone="clear"` + approval-triggers strip |
| `/dashboard/coupons`, `/shipments`, `/broadcasts`, `/teams`, `/branches`, `/leads`, `/flow-builder` | Page-variant activation states |
| `/dashboard/integrations` | Empty-state copy made actionable |
| `/dashboard/customers/[id]`, `/customers/[id]` timeline | Money display fix (§11) |

**27 files modified, 2 added, 960 insertions / 387 deletions.**

## 10. Before / after design decisions

**Products** — *before*: title, "0 منتج", one bordered box with a package badge,
~65% void. *after*: eyebrow → 28px title → what the catalogue is *for* → an
activation surface explaining that an empty catalogue means the assistant
answers no price questions, primary "أضف أول منتج", secondary "استيراد من
متجرك", 3 numbered steps. Measured content height went from ~230px to **693px
of a 900px viewport (25% → 77%)**.

**Segments** — *before*: 9 identical cards, each wrapping 4 more bordered
mini-boxes plus a bordered suggestion panel; ~50 independent borders; a segment
with 400 customers rendered identically to one with zero. *after*: one surface,
one row per segment, hairline dividers, **sorted by size so the biggest
audience leads**, metrics inline, empty segments dimmed with disabled actions.

**Orders** — *before*: five status pills and an empty table shell; **no money
anywhere on the page**. *after*: confirmed revenue is the anchor (34px,
emerald), delivered/pending drop to reference, the table gets entity hierarchy.

**Escalations** — *before*: generic shield box saying "no conversations need
intervention". *after*: reads as confirmation, and the strip answers the real
question behind an empty queue — *is it empty because it's working, or because
it's broken?* — by naming the three things that land here.

**Dashboard home** — deliberately minimal change (§41): the composition was
already sectioned and strong. Only the metric band was re-ranked.

## 11. Bugs found and fixed while working

**Money displayed at 1/100th of actual value — 5 sites.** `Order.total` is
stored and consumed as **whole EGP** everywhere that matters: the WhatsApp
templates in `lib/commerce/templates.ts` send `order.total` raw to the
customer, the orders table row printed it raw, and `fmtMoney` formats it raw.
Five display sites still divided by 100:

- `app/dashboard/page.tsx:376` (7-day revenue), `:516` (recent order total)
- `app/dashboard/orders/page.tsx:101` (confirmed revenue)
- `app/dashboard/customers/[id]/page.tsx:349` (lifetime value)
- `app/dashboard/customers/[id]/customer-timeline.tsx:86` (order event)

A merchant with EGP 4,340 in confirmed revenue saw **"43"**. Fixed — this is
the same defect the earlier correction was aimed at, with five leftovers.
Display-only: no storage, no business logic, no billing, no customer data
touched. **Verified in the browser**: the orders anchor now reads ٤٬٣٤٠ ج.م
against a DB sum of exactly 4340.

**Inbox showed two empty states at once.** With zero conversations, the list
rail said "لا توجد محادثات بعد" while the thread pane — the largest surface in
the product — said "اختر محادثة", i.e. *pick from this empty list*. The thread
pane now carries the activation story when there is genuinely nothing to pick,
and reverts to the quiet "pick one" prompt once conversations exist, where it
is correct.

**`PageHeader` collapsed at 768px** — introduced by me, caught in verification,
fixed. See §14.

## 12. Browser evidence

All verification ran against a **local** dev server (`localhost:3100`) on the
local Postgres scratch DB `keyone_r3`, signed in as the local synthetic tenant
`test-ent@test.local` (`TEST_ENTERPRISE`). **No production data, no production
host, no real customer records.**

Local synthetic data was seeded into that tenant only (6 products, 6 customers,
7 orders across all statuses) so dense states could be verified — §35 step 10.
Seeded rows are prefixed `p_dsgn_`, `c_dsgn_`, `o_dsgn_`.

Verified in-browser, both empty and populated where both exist: dashboard home,
orders, customers, products, segments, coupons, escalations, analytics, inbox,
export, settings/providers.

## 13. Desktop verification

1440×900 and the pane's native ~800px: header hierarchy reads correctly
(eyebrow / title / description / meta are four distinct levels); metric anchors
are unmistakable; the segments and export lists hold their column rhythm.
Analytics reflows its 5-column band to 2-up below ~900px with the anchor
spanning — correct.

## 14. 375px verification

Measured, not eyeballed — `document.documentElement.scrollWidth` vs
`innerWidth` on every route checked:

| Route | scrollWidth | innerWidth | Overflow |
|---|---|---|---|
| `/dashboard/orders` | 375 | 375 | none |
| `/dashboard/segments` | 375 | 375 | none |
| `/dashboard/coupons` | 375 | 375 | none |
| `/dashboard/customers` (768) | — | 768 | none |

- Orders: `MetricBand` stacks 1-up, anchor on top and still visually dominant;
  filter tabs wrap; rows become cards.
- Segments: each row becomes a labelled block (`العملاء` / `الإيراد` /
  `نسبة الشراء`); actions stay reachable.
- Coupons activation state: title wraps cleanly, the 3-step strip stacks
  vertically keeping its numbers, Arabic fully readable at body size.

**Defect found and fixed at 768px:** `PageHeader` originally went side-by-side
at `sm`. On `/dashboard/customers` the action cluster (search form + export +
import + primary) squeezed the title column until `.page-desc` wrapped **one
word per line**. Fixed by stacking until `lg` and giving the title block
`flex-1`. Re-measured after the fix: description renders 448×42px (two normal
lines) at 768px.

## 15. RTL verification

Every new component uses logical properties only — `text-start`, `ps-`/`pe-`,
`ms-`/`me-`, `inset-y-0 start-0`, `sm:col-span-*`. No `left`/`right`, no
direction branch. Confirmed in-browser: metric anchor edge-rules render on the
right (RTL start); the empty-state icon, title, and steps all start from the
right; `HeaderFact` separators sit correctly between facts; Arabic numerals
render via `toLocaleString("ar-EG")` where the surrounding copy is Arabic.

## 16. Console status

`read_console_messages(onlyErrors: true)` → **no errors** on the verified
routes. The only warnings present are pre-existing and unrelated to this work
(a Next.js `<Image fill>` missing-`sizes` warning on the login logo).

## 17. Known limitations

- **Screenshots were read at 860px, not native resolution** (§1). Composition
  findings are solid; nothing here depends on microcopy read from a downscale.
- **Canva contributed nothing** (§5–§7) — the connected account is empty.
- **The inbox zero-state was verified by temporarily archiving the local test
  tenant's customers**, screenshotting, then restoring them (`archivedAt` set
  and immediately nulled; verified 7/7 restored). Local scratch DB only.
- **`npm run build` OOMs on this 8 GB host** at default heap — a V8
  `Mark-Compact` abort inside `next build`, not a code error. Re-run with
  `NODE_OPTIONS="--max-old-space-size=6144"`; result recorded in §19.
- The floating help widget overlaps content at 375px on long pages. Pre-existing
  fixed-position chrome, not touched by this phase.

## 18. Remaining visual debt

Not addressed — these are the honest leftovers, in priority order:

1. **C2 (flat KPI strip) still stands on 9 routes** — `compliance`, `agents`,
   `ai-operations`, `brain`, `command-center`, `revenue-forecast`, `business`,
   `revenue-pro`, `sales-brain`, `monitoring`. `MetricBand` exists and is
   proven; each needs a judgment call about which metric legitimately anchors,
   and several have no honest anchor at all.
2. **`/dashboard/bot` (المساعد)** — 7 tab panels, several of which are a single
   short form floating in a full-height void (screenshots 28–34).
3. **`/dashboard/knowledge-brain`, `/dashboard/brain`** — dense and structurally
   fine, but still `.card`-grid rather than the operational register.
4. **`.card` remains on 72 files.** The semantic three-level surface system
   (§11 of the brief: surface / supporting card / quiet panel) is implied by the
   new components but not yet formalised as tokens.
5. **Admin surface (45 files)** inherits the new type scale but nothing else.
6. `data-table` / `ops-table` / `crm-row` are still barely used; the tables that
   were rebuilt here use bespoke grids rather than those classes.

## 19. Build, typecheck, commits

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** — see note below |
| `npm run build` | recorded below |
| Regression verifiers | not run (no schema, RBAC, or pipeline change in this phase) |

**On the "5 known Prisma admin type errors":** the working brief says to expect
them. This branch typechecks at **0 errors**, so either they were already
resolved before `f38fece` or they surface only under a different Prisma client
generation. Either way, **no new type errors were introduced** — which is the
condition that actually matters.

### Commits

| Hash | Subject |
|---|---|
| `cc76999` | `feat(design): give the dashboard a composition language, not just tokens` — globals.css type scale, EmptyState rebuild, PageHeader, MetricBand |
| `a914e4f` | `fix(money): stop showing merchants 1/100th of their revenue` — the 5 `/100` display sites + row currency alignment (7 lines, isolated) |
| `c177e18` | `feat(design): compose the operational surfaces instead of stacking cards` — 22 route files |

Build was re-run green after the final commit set.

---

## 20. Local test-environment notes (not part of the diff)

These changes live only in the local scratch Postgres DB `keyone_r3` and are
recorded so the next session is not surprised by them:

- **`test-ent@test.local` password was set to `DesignTest!2026`** so the login
  form could be driven in a real browser (the in-app browser cannot overwrite
  the httpOnly `mse_session` cookie from JS, so a minted token could not be
  injected). Local scratch DB only.
- **Synthetic rows seeded** into that tenant for dense-state verification:
  6 products (`p_dsgn_*`), 6 customers (`c_dsgn_*`), 7 orders (`o_dsgn_*`
  spanning pending/confirmed/shipped/delivered/canceled). Remove with:
  ```
  psql -d keyone_r3 -c "DELETE FROM \"Order\" WHERE id LIKE 'o_dsgn_%'; DELETE FROM \"Product\" WHERE id LIKE 'p_dsgn_%'; DELETE FROM \"Customer\" WHERE id LIKE 'c_dsgn_%';"
  ```
- The worktree needed `saas/node_modules` symlinked from the main checkout and
  a local `saas/.env` pointing at `keyone_r3`; `.claude/launch.json` was
  temporarily pointed at port 3100 (port 3000 was held by another session) and
  **reverted before commit** so the shared config is unchanged.


---

## 21. Reconciliation with the live production baseline (2026-09-04)

Phase 11 was authored against `f38fece`. Production was actually running
`8b5eba4` — `f38fece` plus an entire **UI design-system effort (Phases 1–10,
~46 commits)** that had been deployed directly from a local commit and never
merged back into `main`. Everything in §1–§20 above was therefore written
without sight of that work. This section records what changed when the two were
reconciled.

**Method:** `git rebase --onto 8b5eba4 f38fece`, dropping the redundant money
commit. Five route conflicts, each resolved by hand — not by taking a side.

### What the reconciliation caught

| Collision | Resolution |
|---|---|
| **Two `PageHeader`s.** Production had `components/patterns/page-header.tsx` with 6 consumers; Phase 11 added a richer one at `components/ui/page-header.tsx` — on 5 of those same 6 pages | Production's stays **canonical**. Phase 11's additions (eyebrow, `meta` facts, ranked `secondary`/`actions`, `status`, `divider`) folded into it; the duplicate deleted. All pre-existing call sites unchanged, all additions opt-in |
| **`.ai-btn-primary` / `.ai-btn-ghost` were deleted** from globals.css in Phase 2B. Phase 11 added 7 fresh usages | All migrated to `btn-primary`/`btn-ghost`. Left alone, these would have rendered as **unstyled buttons in production** |
| **Duplicate money fix.** Production already had `b0ebb6b` — same 4 sites, same values | Phase 11's `a914e4f` dropped as redundant. Only its unique part kept: the orders row printed `920 EGP` while the header printed `٤٬٣٤٠ ج.م` on the same page |
| **A11y from Phase 1–10** on the conflicted files | Preserved explicitly: `role="search"` + both aria-labels on customers, aria-label on products search, and the `.input` token those fields had been migrated onto |

### Corrections to earlier sections

- **§11 overstates the money finding.** It was already fixed and live in
  `b0ebb6b` before this branch touched it — and the original Phase 11 brief did
  say so ("already corrected, do not undo it"). The branch it was authored
  against simply predated the fix. Phase 11 contributed the format alignment,
  not the fix.
- **§18's debt item on the floating help widget overlapping content at 375px is
  already fixed upstream** — Phase 1–10 changed `.pb-safe` to clear it.
- **§3's finding that the operational vocabulary was unused still holds** for
  `.metric-band-cell` / `.attention-item` / `.ops-table` / `.crm-row`.

### Remaining routes — deliberately unchanged

`compliance`, `agents`, `brain`, `command-center`, `revenue-forecast`,
`business`, `revenue-pro`, `sales-brain`, `monitoring`, `bot` were reviewed and
**left alone**. None is touched by either effort, all load clean with no console
errors and no horizontal overflow, and all already gain the new type scale for
free. `/dashboard/bot` is a configuration form with no honest primary metric —
forcing a `MetricBand` onto it would have manufactured a KPI, which the brief
explicitly prohibits.

### Canva

No usable reference material available (see §5–§7). Not revisited.
