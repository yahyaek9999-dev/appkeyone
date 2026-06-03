# KEYONE — Onboarding Module Report

**Date:** 2026-06-03
**Epic:** A — Onboarding Wizard
**Status:** ✅ Implemented (additive only — no schema changes, no send-pipeline touches)

---

## Background / Gap

Per the First-Time User Report (KEYONE_FIRST_TIME_USER_REPORT.md), the #1 documented
onboarding friction was: **new users see a dashboard full of zeros with no guidance**.
The `/onboarding` wizard already existed (5-step bot setup), and PDF/DOCX/URL import
was already wired. The missing piece was a Getting-Started checklist on the overview page.

---

## What Was Already Complete (No Changes Needed)

| Feature | Status |
|---------|--------|
| 5-step onboarding wizard (`/onboarding/wizard.tsx`) | ✅ Already complete |
| Persona-pack seeding (zero LLM cost) | ✅ Already complete |
| PDF/DOCX/URL import routes | ✅ Already complete |
| Knowledge base CRUD | ✅ Already complete |

---

## Changes Implemented

### A1 — Getting-Started Checklist (additive)

**New file:** `app/dashboard/_getting-started.tsx`  
**Edited file:** `app/dashboard/page.tsx`

A client component rendered at the top of the overview dashboard below the header.
Auto-hides once all required steps are complete. Dismissible via localStorage.

**Steps tracked:**
| Step | Required | Source |
|------|----------|--------|
| Connect WhatsApp | Yes | `user.bot.whatsappStatus === "connected"` |
| Configure AI bot | Yes | `bot.name.trim().length > 0` |
| Add knowledge | Yes | `Document.count > 0` |
| Connect store | No (optional) | `CommerceIntegration.count > 0` (enabled=true) |
| Send first campaign | Yes | `Broadcast.count > 0` |

**Three extra DB counts added** to the existing `Promise.all` in `page.tsx`:
- `prisma.document.count` — zero-cost index scan
- `(prisma as any).commerceIntegration.count` — wrapped with `.catch(() => 0)` for safety
- `prisma.broadcast.count` — wrapped with `.catch(() => 0)` for safety

**UX behaviour:**
- Shows progress bar (`doneCount / total`) with Arabic fraction label
- Each incomplete step has a deep-link CTA button
- Optional steps labelled "اختياري"
- Completed steps show strikethrough + check icon
- X button writes `keyone_getting_started_dismissed=1` to localStorage → permanently hidden
- Auto-disappears (no localStorage write needed) when all required steps are done

---

## Before / After

### Before
- New user lands on `/dashboard` → sees all-zero KPI cards with no guidance
- No indication of what to do next

### After
- Getting-Started checklist appears below the greeting header
- Each step links directly to the relevant page
- Disappears automatically once the merchant is fully set up

---

## Files Changed

| File | Change |
|------|--------|
| `app/dashboard/_getting-started.tsx` | NEW — Getting-Started checklist component |
| `app/dashboard/page.tsx` | Added 3 counts to Promise.all, computed step booleans, rendered `<GettingStarted />` |

## Not Changed (intentionally preserved)

- `app/onboarding/wizard.tsx` — existing wizard untouched
- `app/api/onboarding/setup/route.ts` — existing setup untouched
- All send pipeline, queue, billing, analytics files — zero touches

---

## Verification

- `npx tsc --noEmit` → 0 errors
- `npm run build` → build passes
- `npm run verify:all` → regression suite passes
- Manual: visit `/dashboard` as a new user (all counts 0) → checklist appears → complete each step → checklist auto-hides
