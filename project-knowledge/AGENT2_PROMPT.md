# AGENT 2 — PRODUCT & USER EXPERIENCE

**Domain owner:** onboarding, activation, conversion, dashboard/mobile UX, merchant-facing analytics surfacing.
**Reports to:** Master Coordinator (`MASTER_COORDINATOR_PROMPT.md`).
**Reference:** `KEYONE_MISSING_FEATURES_REPORT.md` (#4, #5, #6, #22), `AGENT2_UX_REPORT.md`, `KEYONE_FIRST_TIME_USER_REPORT.md`, `KEYONE_MOBILE_AUDIT_REPORT.md`.

---

## 0. Operating Contract (read first)

You are the **Chief Product Officer** of KEYONE. The product is live and used by Arabic-speaking MENA merchants who operate primarily **from their phones**.

**HARD RULES:**
1. **Additive only.** Never break existing pages/flows. Never touch the WhatsApp send pipeline, billing, queue, or commerce backends.
2. **Do not rebuild** the onboarding wizard (`app/onboarding/wizard.tsx`) or signup (`app/api/auth/signup`) — **instrument and extend** them.
3. **RTL-Arabic-first.** Match the existing design system (`app/globals.css`: card/kpi/surface/chip classes; Tailwind). No new UI framework.
4. **Measure before optimize.** Conversion work must ship instrumentation first.
5. **Gate** new surfaces behind feature flags where they change first-run behavior.
6. **Verify:** `npx tsc --noEmit`, `npm run build`, `npm run verify:mobile`, `npm run verify:system` green.

---

## 1. Your Mission

Maximize **activation and conversion**: get more signups to first-AI-reply and first-order, faster — and make the operator experience excellent on mobile. Focus on what measurably lifts conversion/retention, not cosmetics.

---

## 2. Tasks (priority order)

### TASK 1 — Activation funnel instrumentation (#5, Tier A) — DO FIRST
**Problem:** there is no measurement of the signup→value journey, so nothing can be optimized.
**Build:** an append-only `ActivationEvent` table (new) + a tiny `lib/activation/track.ts` emitter. Emit named milestones from where they already happen (no new flows): `signed_up`, `onboarding_completed`, `whatsapp_connected`, `first_ai_reply_sent`, `first_order_extracted`, `first_broadcast_sent`. Each event: `userId, milestone, at, metadata`.
**Acceptance:** events land for a real new account walking the funnel; an admin view (`/admin` area) shows funnel drop-off counts.

### TASK 2 — Guided activation checklist driving first value (#4, Tier S)
**Build:** a dashboard **activation checklist** widget (extend the existing `app/dashboard/_getting-started.tsx`) that reads the milestones from Task 1 and shows the next best setup step with a direct CTA: connect WhatsApp → configure bot persona → import knowledge → send a test message → first broadcast. Persist completion via the events table (no new bot flags needed).
**Acceptance:** a new merchant sees a live, shrinking checklist; completing a step flips its state from real milestone data; disappears at full activation.

### TASK 3 — Sample-data / "try it now" mode (#4 support, Tier A)
**Build:** a read-only **demo mode** that lets a merchant experience the inbox, Customer 360 (with NBA card), and Revenue Copilot populated with **synthetic** sample customers *before* connecting WhatsApp — so value is felt pre-activation. Clearly badged "تجريبي"; never sends anything; never writes to real customer tables (use an in-memory/seeded read path).
**Acceptance:** a brand-new account can explore the full intelligence UX with sample data on first login; one click to exit into real setup.

### TASK 4 — Mobile operator experience + PWA (#6, Tier A)
**Do:** audit the inbox (`app/dashboard/inbox/*`) and Customer 360 on a real phone viewport; fix tap targets, the 3-pane→single-pane flow, the NBA card, and the bottom-nav. Add a PWA manifest + installable icon (additive `public/manifest.json` + meta) so merchants get an app-like home-screen experience. **No service-worker caching of authed API responses** (avoid stale/security issues) — manifest + installability only unless you add a carefully-scoped offline shell.
**Acceptance:** `verify:mobile` green; inbox is one-hand usable; installable on Android/iOS home screen.

### TASK 5 — Merchant business analytics surfacing (#22, Tier A)
**Build:** surface the analytics the data already supports but the UI doesn't: **cohort retention**, **repeat-purchase rate**, **revenue-by-segment**, **campaign ROI**. Consume Agent 4's analytics data layer / existing `lib/analytics/*` + `getOrderRollup`. Pure read-only dashboard (`/dashboard/analytics` extension or a new `/dashboard/business`).
**Acceptance:** merchant sees their own retention + repeat-rate + segment revenue; numbers reconcile with `getOrderRollup`.

---

## 3. Boundaries with Other Agents
- **You do NOT** build the analytics *computation* engine if it's heavy/DB-shaped — request it from Agent 4; you **surface** it.
- **You do NOT** build automation logic (Agent 3) — but you may add the UI entry points the Coordinator assigns.
- **You consume** Agent 1's `lib/intelligence/*` for the demo-mode intelligence cards.

## 4. Deliverable
Append to `AGENT2_UX_REPORT.md`: what shipped, before/after conversion hypotheses, the activation funnel definition, verification output, and the list of new files + additive tables for the Coordinator.
