# KEYONE — Final Recommendations

**Generated:** 2026-06-03
**Context:** Companion to `KEYONE_AI_INTELLIGENCE_TRANSFORMATION_REPORT.md` and `KEYONE_CURRENT_STATE_AUDIT.md`.

---

## 1. What Was Delivered (this pass)

A **read-only AI intelligence layer** — fusion, ranking, learning, and surfacing on top of scores KEYONE already computes. Net-new files, zero edits to protected systems, zero schema migration:

| File | Role |
|---|---|
| `lib/intelligence/types.ts` | Shared types for the layer |
| `lib/intelligence/next-best-action.ts` | Unified per-customer NBA (11 actions + confidence + message) |
| `lib/intelligence/value-tier.ts` | LTV value-tier classification (platinum→lead) |
| `lib/intelligence/churn.ts` | Churn probability (0-100) + sentiment trend |
| `lib/intelligence/self-learning.ts` | Follow-up outcome learning + A/B significance guard |
| `lib/intelligence/revenue-opportunity.ts` | Revenue Copilot unified ranked worklist |
| `app/api/revenue-copilot/route.ts` | One-round-trip Copilot endpoint |
| `app/dashboard/revenue-copilot/*` | "مساعد الإيرادات" page |
| `app/api/customers/[id]/profile/route.ts` | Extended with additive `advice` block |
| `app/dashboard/inbox/customer-360.tsx` | Next Best Action card |
| `app/dashboard/nav-items.tsx` | Nav entry |

### Intelligence / revenue / customer impact
- **Intelligence:** the system now produces a single, explainable decision per customer (was: scattered scores the merchant had to interpret).
- **Revenue:** every opportunity carries an EGP estimate and a global priority → merchants work the money, not the noise. Self-learning compounds this over time.
- **Customer:** faster, more relevant outreach (NBA), fewer lapses caught early (churn band), better-timed win-backs (value-tier weighting).

---

## 2. Verification Status (CLAUDE.md gate)

CLAUDE.md requires **typecheck + build + regression verification** before deploy. The work is implemented and manually type-reviewed against the codebase (strict mode, existing Prisma field names, existing auth/route conventions). During this session the sandbox's command-execution safety classifier was intermittently unavailable and blocked compiler/build invocations (`npx tsc`, `next build`), so automated verification could not be captured here.

**Required before deploy (owner machine or once execution is available):**
```bash
cd saas
npx tsc --noEmit                 # typecheck
npm run build                    # prisma generate + next build
npm run verify:system            # read-only regression checks
```
All three must pass. The changes are additive and read-only, so risk is low, but the gate is mandatory.

> Note: design intent is that this layer needs **no `prisma db push`** — it adds no columns/tables. Confirm `git status` shows only the files in §1.

---

## 3. Top 10 Future Improvements (ranked)

1. **Wire learned follow-up weights into `queueSmartFollowUp` priority** — `getLearnedKindWeights()` already exists; multiply task `priority` by the learned weight so the system literally gets better at follow-ups over time. *(High revenue, low risk, read-only at queue time.)*
2. **Apply the A/B significance guard to `/api/broadcasts/ab/[groupId]`** — replace the naive "higher rate wins" with `evaluateAbSignificance()`. *(Stops false winners; low risk.)*
3. **Persist NBA + churn snapshots** via a nullable `Customer.nextBestAction` / `churnProbability` column, written from the existing fire-and-forget `classifyAndScore` tail — enables trend charts and A/B of the NBA itself. *(Medium; one additive column, no hot-path send change.)*
4. **Autonomous cart-abandonment trigger** — `cartItems/cartUpdatedAt/cartReminderSent` exist but no engine fires; queue a single opt-in follow-up through the **existing** send pipeline. *(High revenue; gated, opt-in.)*
5. **Product affinity / cross-sell matrix** (daily batch over `OrderItem`) to make upsell suggestions specific ("bought X also bought Y") instead of generic. *(High revenue.)*
6. **Optimal-next-price suggestion** from `NegotiationState.acceptedMin/Max/rejectedOffers` (merchant-facing only, never auto-applied). *(High leverage for price-sensitive segment.)*
7. **Revenue Copilot on the daily WhatsApp digest** — inject the top 3 opportunities into `lib/daily-report/extras.ts` so merchants act without opening the dashboard. *(High engagement.)*
8. **Customer Twin / lookalike slide-over** — nearest customers by score profile + their outcomes, to predict and pick the proven action. *(Differentiator; medium complexity.)*
9. **Conversation quality grade (A–D)** combining `memoryConfidence` + KB-gap frequency + intent clarity → prioritize KB improvements and human-takeover. *(Improves automation quality.)*
10. **Intelligence feature-flag + per-plan gating** (env `ENABLE_INTELLIGENCE_FEATURES` + `Plan.featureFlags`) to dark-launch and monetize the layer per tier — mirror the existing `META_CLOUD_ENABLED` pattern. *(Monetization; low risk.)*

---

## 4. Strategic Verdict

KEYONE was already an intelligent product; it was **under-surfacing** its own intelligence and **not learning** from its outcomes. This pass fixes both with the lowest-risk class of change available. The next compounding wins are (1) closing the learning loop into follow-up priority and (2) pushing the Revenue Copilot into the channels merchants already read (daily digest, inbox). Those turn a smart dashboard into a self-improving sales operating system.

**Stop condition reached:** remaining high-value work now depends on either small additive schema columns (items 3–4) or net-new surfaces (8–9) that warrant their own review cycle — not refactoring or cleanup. Recommend deploying this pass after the verification gate, then taking items 1–2 (pure read-only, no schema) as the immediate next increment.
