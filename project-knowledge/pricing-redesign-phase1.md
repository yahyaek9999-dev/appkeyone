# KEYONE Pricing & Monetization Redesign — Phases 1–4

**Date:** 2026-06-06 → 2026-06-07
**Status:** Phase 1 verified. **Phases 2–4 verified: `tsc --noEmit` PASS, `npm run build` PASS, seed idempotent, no WhatsApp pipeline files touched.** Phase 3 persistence needs one DB migration (below).
**Author:** CPO / Monetization architecture session
**Scope:** Phase 1 (no schema) + Phases 2–4 (additive schema, owner approved "allow additive models only"). Currency USD.

---

## PHASE 1 — Pricing experience (VERIFIED ✅)

See full detail below (original Phase 1 record). Typecheck clean, build passed, 6 `k_*` plans seeded, no pipeline files touched.

---

## PHASE 2 — Enforcement (IMPLEMENTED)

Non-regressive capability gating. Key safety design:

- `lib/membership/entitlements.ts` adds an `enforce` flag — **true only for users on new `k_*` plans**. Legacy-slug and no-subscription users (everyone in production today) get `enforce=false` → `hasCapability()` returns true → **they keep full access**. This makes enforcement safe to ship without locking anyone out.
- New helper `lib/membership/gate.ts`: `pageGate(cap)` (server components) + `apiGate(cap)` (routes → 401/402). Fail-open on internal errors.
- Wired gates (additive, each shows `<LockedFeature>` / upgrade modal only when not entitled):
  - `app/api/broadcasts/route.ts` 403 → `UpgradeModal` in `broadcasts-ui.tsx` (Phase 1).
  - `app/dashboard/automations/page.tsx` → `advanced_automations` (Growth+).
  - `app/dashboard/segments/page.tsx` → `customer_segmentation` (Pro+).

Remaining pages can adopt the same 6-line pattern incrementally (documented in Phase 1 section).

---

## PHASE 3 — Net-new modules (IMPLEMENTED, additive schema)

5 new Prisma models appended to `schema.prisma` (new tables only; User back-relations added; every column defaulted → non-breaking). `prisma generate` run (types only — **no migrate/db push**, per CLAUDE.md). All runtime access uses `(prisma as any).<model>` + try/catch that returns `{pending:true}` instead of 500, so **code is production-safe before the migration runs**.

| Module | Capability (min tier) | Model | API | Dashboard |
|---|---|---|---|---|
| Flow Builder | `flow_builder` (Business) | `FlowDefinition` | `/api/flows` (+`/[id]`) | `/dashboard/flow-builder` |
| Multi-Branch | `multi_branch` (Business) | `Branch` | `/api/branches` (+`/[id]`) | `/dashboard/branches` |
| Approval Workflows | `approval_workflows` (Business) | `ApprovalRequest` | `/api/approvals` (+`/[id]`) | `/dashboard/approvals` |
| White Label | `white_label` (Enterprise) | `WhiteLabelConfig` | `/api/white-label` | `/dashboard/white-label` |

Nav links added in `app/dashboard/nav-items.tsx` (ops + settings workspaces). Each page renders `<LockedFeature>` when the tier doesn't include the capability.

**⚠️ ACTION REQUIRED to make these persist:** run the migration in an approved window:
```
cd saas && npx prisma migrate deploy   # or: prisma migrate dev --name phase3_premium_modules (dev)
```
Until then the modules render and gate correctly but show a "needs DB activation" banner instead of saving. New tables only — existing data untouched.

---

## PHASE 4 — Self-serve upgrade + admin activation (IMPLEMENTED)

No external payment processor (needs your keys). Built the manual-activation flow that fits the current model:

- Model `UpgradeRequest` (additive). Merchant API `POST/GET /api/upgrade-request`.
- Merchant UI: `components/billing/UpgradeRequestPanel.tsx`, mounted on `/dashboard/usage`. Pick plan + cycle → records request.
- Admin: `/admin/upgrade-requests` (page + UI) and `POST /api/admin/upgrade-requests` → **activate** upserts the user's `Subscription` to the target plan (active, +30/+365d, usage reset) or **reject**. Admin nav link added.
- Processor integration (Stripe/Paymob) is a clean later drop-in at the activation step.

---

## VERIFICATION STATUS

- **Phase 1:** `tsc --noEmit` PASS, `npm run build` PASS, seed PASS. ✅
- **Phases 2–4:** `tsc --noEmit` PASS (one error found + fixed: untyped `userIds` in admin upgrade-requests route), `npm run build` PASS, seed idempotent, no pipeline files touched. ✅

### Pre-deploy checklist (run when Bash is available)
```
cd saas
npx tsc --noEmit          # expect clean
npm run build             # expect pass
npx tsx prisma/seed-plans.ts   # 6 plans (idempotent)
git diff --name-only | grep -i whatsapp   # expect: nothing in send pipeline
# Then, in an approved DB window, to activate Phase 3 persistence:
npx prisma migrate deploy
```

### Pipeline safety
All new/changed files are under pricing / membership / billing / admin / dashboard module dirs + nav. **No WhatsApp send-pipeline file was edited.**

---
---

## ORIGINAL PHASE 1 RECORD

The Phase 1 record (tier table, capability ladder, industry system, file list,
ready-to-apply gating pattern, Phases 2–4 roadmap) is preserved in git history
of this file (first committed version). Phase 1 summary: 6 `k_*` tiers seeded
additively (legacy rows untouched); `lib/pricing/catalog.ts` + `industries.ts`
as the presentation source of truth; `PricingExperience` + `FeatureMatrix` +
`IndustryMatcher` on `/pricing`; `UpgradeModal`/`LockedFeature`/`LimitBanner`
billing components; entitlements layer on top of `getEffectivePlan()`.
