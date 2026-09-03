# Phase 10 — Aveiro-informed marketing + auth redesign

**Date:** 2026-09-03
**Branch:** `claude/domain-migration-inventory-b12e5a`
**Routes:** `/features`, `/projects`, `/pricing`, `/login`, `/signup`

---

## 1. Aveiro resources actually used

Aveiro was queried through its MCP and its live template sites were inspected in the
browser. It is a **publishing platform**, not a SaaS dashboard kit — so it was used as a
source of **editorial and marketing doctrine**, not as a UI library to copy.

| Aveiro resource | What was extracted |
|---|---|
| `aveiro_list_templates` | 8 templates; `spotlight` (editorial/founder), `gallery` + `focus` (image-led), `magic-blog` (section rhythm) identified as the relevant references |
| `aveiro_authoring_guide` (structure, components, images) | The written editorial doctrine — quoted below |
| `spotlight.aveiro.page` (live DOM/CSS) | Display type metrics: **64px / weight 600 / line-height 68px (1.06) / letter-spacing −2.56px (−0.04em)** on a `rgb(10,10,10)` canvas |
| `gallery.aveiro.page` (live DOM/CSS) | Image-led card treatment: `radius 0`, no border, no shadow, **16:9 `object-cover` inside `overflow:hidden`** — the image *is* the card |

### Doctrine taken from the authoring guide

1. **Single-CTA discipline** — "At most ONE call-to-action button where the reader is ready
   to act. Never a row of buttons; secondary destinations belong in prose links."
2. **Editorial linearity** — "One idea per section, sections in reading order. No
   sidebars-in-content, no multi-column trickery, no decorative wrappers."
3. **Components are punctuation, not scaffolding** — restraint over layout machinery.
4. **Image discipline** — "One strong image near the top earns its place; a gallery of
   filler does not. Match the image to the section it illustrates."
5. **Hero anatomy** (`Hero1`) — badge → headline → description → primary (+secondary) CTA → media.
6. **Measure discipline** — explicit `maxWidth` on text; "prefer a value near the MIDDLE of
   the range" for sizes.

### The WKEYONE-specific decision

Aveiro's *measured* display metrics (600 weight, −0.04em, 1.06 line-height) turned out to be
almost exactly WKEYONE's **existing** `.display-heading` token
(`font-semibold; letter-spacing: -0.035em; line-height: 1.06; text-wrap: balance`).

So rather than importing Aveiro's type CSS, the phase **adopted WKEYONE's own token** wherever
surfaces had bypassed it. Same for eyebrows: Aveiro's editorial eyebrow was expressed through
the existing gold `.eyebrow` token. Aveiro supplied the *rationale*; WKEYONE supplied the *values*.

**Key evidence-driven finding:** gold `#C9A24B` is documented in `tailwind.config` as the
brand secondary for "premium edges, dividers, **counters, eyebrows, badges**, CTA highlights",
yet it appeared **zero times** across all five routes, the landing, and `pricing-cards`.
Half the brand palette was dormant. Phase 10 activates it in exactly the roles the brand doc assigns.

---

## 2. Before / after per route

### `/features` — rebuilt (commit `767c4e9`)
- **Was wrong:** the weakest public surface. 36 lines: a bare grid of 7 checkmark cards.
  **English only**, no `PublicNav`, no `PublicFooter`, no hero, no product visuals, and
  `text-3xl font-extrabold` bypassing `.display-heading`.
- **Aveiro influence:** editorial linearity (one idea per section, reading order); image-led
  proof at 16:9; single-CTA discipline; `Hero1` anatomy.
- **WKEYONE decision:** gold `.eyebrow` + `.display-heading` tokens; kept the real factual
  content (channels, AI providers, dialects, integrations, industries) rather than inventing copy.
- **Changed visually:** full AR/EN + RTL page — hero (gold eyebrow → 60px display headline →
  description → one CTA), then 5 capability chapters, each *problem → capability → real product
  visual → capability facts*, alternating sides; the problem is set off by a **gold rule**
  rather than a coloured box; then industries; then one closing CTA.
- **Browser evidence:** h1 measured **60px / 600 / lh 1.0 / ls −2.1px**; eyebrow
  `rgba(208,173,87,0.9)`; 6 images; `dir=rtl`; no overflow at 1440 or 375.

### `/login` + `/signup` + auth layout — reworked (commit `26f34ef`)
- **Was wrong:** no password-visibility toggle; errors rendered as a plain `div` (**silent to
  screen readers**); no `aria-busy`; signup labels not bound to inputs; no `focus-visible`
  rings; headings used ad-hoc `text-2xl font-bold`; a network failure left the form stuck.
- **Aveiro influence:** restraint — the brief forbids marketing clutter in auth, matching
  Aveiro's "components are punctuation" doctrine. No decoration was added; only hierarchy and correctness.
- **WKEYONE decision:** kept the existing split brand panel and glass card (they already work);
  adopted `.display-heading`; gold used only for the counters.
- **Changed visually:** larger, tighter headings; eye/eye-off toggle with a 44px target;
  errors now carry an icon; gold counters replace the old emerald ones.
- **Browser evidence:** toggle flips `type` password↔text with `aria-label`/`aria-pressed`
  updating and a **44×43px** target plus matching 44px input end-padding; a real failed login
  produced `role="alert" aria-live="polite"` with the true API message
  ("بريد أو كلمة مرور خاطئة"); `aria-busy` returns to `false`.
- **Auth/business logic unchanged.**

### `/pricing` — strengthened (commits `55bce91`, `3ebe006`)
- **Was wrong:** already strong (PricingExperience, FeatureMatrix, IndustryMatcher, tier
  catalog) — **kept**. Two real gaps: no FAQ at all (purchase questions were sent to the
  landing page), and no reassurance at the decision point.
- **Aveiro influence:** `AccordionGroup` as the FAQ primitive; reassurance placed *where the
  reader is ready to act*.
- **WKEYONE decision:** reused the existing `FaqAccordion` rather than duplicating UI.
- **Changed visually:** a 3-up reassurance strip with gold icons directly under the plans, and
  a full FAQ section above the contact CTA.
- **Browser evidence:** 3 trust cards with gold `rgb(208,173,87)` icons; 6 FAQ questions;
  no overflow at 1280; strip collapses to one column at 375.
- **No prices, plans or commercial facts were touched.**

### `/projects` — visual proof added (commit `3ebe006`)
- **Was wrong:** already strong (gold eyebrow, display heading, metrics, sector chips, case
  studies, and an honest "figures are illustrative" disclosure) — **kept**. The one gap: no
  visual proof of the product the case studies keep describing.
- **Aveiro influence:** "one strong image earns its place; a gallery of filler does not."
- **WKEYONE decision:** a first attempt used a 3-up grid of the product diagrams; measurement
  showed these assets are **~95% near-black** (avg luma 9.6/255, only 4.4% of pixels above
  luma 60), so at ~378px they read as dark rectangles. It was restructured to **one large
  legible visual** beside the capability grouping — the doctrine applied literally.
- **Browser evidence:** "One Intelligent Platform" diagram renders fully at 644px beside the
  gold-ruled capability list; no overflow at 1440 or 768.

### Cross-surface integrity + consistency (commit `26f34ef`)
- The auth brand panel shipped **fabricated outcome claims** — `+47% معدل التحويل`,
  `3.2× نمو الإيرادات`, `98% رضا العملاء`. The brief prohibits invented metrics, so these were
  replaced with verifiable product facts (2 WhatsApp channels, 5 Arabic dialects, 6 AI providers).
- **Self-correction:** the landing carried the same problem introduced in *Phase 9* by this
  same workstream — `99.9% وقت تشغيل مضمون` ("guaranteed uptime") and `< 3ث` response were
  fabricated SLA claims. Both were replaced with the same verifiable facts.
- `.lp-section-eyebrow` was emerald while `.eyebrow` is gold; the landing now matches the
  other marketing surfaces and the brand doc.

### Routine defects fixed in passing
- `FeatureMatrix` returned a bare `<>` from a `.map()`, emitting a React "unique key prop"
  warning on every `/pricing` render — now a keyed `<Fragment key={cat}>` (commit `cb0b8ed`).
- `/projects` declared `width={1672}`, causing Next to request a **3840px** image variant for a
  644px slot. Added `sizes` on `/projects` and `/features` product images.

---

## 3. Verification

**Responsive** — checked per surface, measured in the DOM (not assumed from HTTP 200):

| Route | 1440 | 1280 | 768 | 375 |
|---|---|---|---|---|
| /features | no overflow | — | — | no overflow, nav collapses, headline wraps cleanly |
| /pricing | — | no overflow | — | no overflow, trust strip → 1 column, FAQ intact |
| /projects | no overflow | — | no overflow, 0 offenders | — |
| /login | split panel correct | — | — | — |
| /signup | — | — | — | clean single column |

**RTL** — `dir=rtl` confirmed; logical properties verified rendering on the correct side
(`border-s-2` gold rules render right-side in RTL; password toggle sits at the input `end`).

**TypeScript** — 5 errors total, all pre-existing admin `Prisma mode:"insensitive"` errors.
**0 new errors.**

**Build** — `next build` succeeds. It first aborted on V8 heap exhaustion at Node's default
heap; it completes with `--max-old-space-size=8192`, so this is a local memory limit, not a
code regression. All five routes compile: `/features` 229 kB, `/pricing` 235 kB,
`/projects` 229 kB, `/login` 173 kB, `/signup` 174 kB.

**Console** — the React key warning is gone. CSS-applied state verified directly
(gold eyebrow `rgba(208,173,87,0.9)`, h1 48px/600, canvas `rgb(10,10,12)`).

### Verification note worth keeping
Two recurring "black frame" screenshot artifacts were traced to root cause, and **neither is a
code defect**:
1. The pages use **Lenis** smooth scroll, which overrides `window.scrollTo` and resets
   `scrollTop` — programmatic scrolling silently fails.
2. When the Browser pane is hidden, `requestAnimationFrame` is throttled, so `SectionReveal`
   (framer-motion `whileInView`) **freezes mid-animation** — measured at `opacity: 0.33`.
   Dark product diagrams disappear at that opacity while text stays faintly legible.
   Forcing the reveal to complete rendered every image correctly.
This also explains the "black frames" recorded in Phase 8/9 on the landing page.

---

## 4. Remaining issues

- `next build` needs `--max-old-space-size=8192` on this machine.
- 5 pre-existing admin `Prisma mode:"insensitive"` type errors, untouched.
- `/docs` and `/support` were out of scope and still lack the marketing shell that
  `/features` now has.
- The product diagram assets are very dark (~4.4% of pixels above luma 60); they read well
  at ≥560px but are unsuitable for small multiples. A lighter variant would let them be used
  in compact layouts.

## 5. Commits

| Commit | Scope |
|---|---|
| `767c4e9` | `/features` rebuilt as image-led product storytelling |
| `26f34ef` | auth UX/a11y, honest metrics, gold eyebrow consistency |
| `55bce91` | `/pricing` reassurance strip + FAQ |
| `3ebe006` | `/projects` product visual proof + image `sizes` |
| `cb0b8ed` | `FeatureMatrix` keyed fragment |

**Not touched:** Meta, Bridge, WhatsApp send pipeline, DNS/Caddy, production env, database,
migrations, authentication logic, pricing/commercial facts. No deployment performed.
