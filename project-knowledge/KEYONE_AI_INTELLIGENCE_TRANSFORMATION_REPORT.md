# KEYONE — AI Intelligence Transformation Report

**Generated:** 2026-06-03
**Build target:** additive intelligence layer on top of live production (`app.keyone1.com`)
**Operating mode:** autonomous executive + Chief AI Scientist
**Scope decision (owner-approved):** read-only intelligence layer; implement + verify, **do not deploy** (owner reviews & deploys).

---

## 1. Thesis

The PHASE 0 audit (`KEYONE_CURRENT_STATE_AUDIT.md`) established that KEYONE **already** has deep, production-grade intelligence: intent, emotion, objection, lead-temperature, lead/conversion/hesitation/retention scoring, persuasion + negotiation engines, a memory engine, four intel detectors, and a revenue forecaster. Rebuilding any of these would have violated CLAUDE.md ("Never rewrite working systems") and added risk for no gain.

So the transformation is **not new engines — it is fusion, ranking, learning, and surfacing** of intelligence the system already produces. Every line added is a **read-only derivation**: it reads scores the message pipeline already wrote, never recomputes or overwrites them, never touches the WhatsApp send pipeline, queue, billing, safety, or commerce, and requires **no schema migration**.

This converts trapped value into merchant-visible revenue actions — the highest-leverage, lowest-risk move available.

---

## 2. What Was Implemented

### 2.1 Unified Next Best Action engine — `lib/intelligence/next-best-action.ts`
Closes the #1 PARTIAL gap. Fuses the existing scattered tactical signals (conversion score, hesitation, churn, psychology-via-objections, negotiation state, recency, awaiting-reply) into **one** merchant decision per customer:

- **11 actions:** `escalate`, `answer_fast`, `close_now`, `build_trust`, `offer_value`, `upsell`, `win_back`, `reduce_friction`, `nudge_followup`, `nurture`, `hold`.
- Each yields a **confidence (0-100)**, an Arabic title + reason, a **ready-to-paste Arabic message**, and a **priority** (urgency × confidence × value tier).
- Pure function. No LLM call, sub-millisecond. Decision tree ordered by revenue-protection severity (frustration first, then speed, then close).

### 2.2 Customer Value Tier (LTV) — `lib/intelligence/value-tier.ts`
Derives `platinum | gold | silver | bronze | lead` from real order facts (`getOrderRollup`), with recency decay (a big spender gone 120+ days is demoted, not flattered). Carries an Arabic label + a value **weight** used to size opportunity estimates. Pure function.

### 2.3 Churn probability + Sentiment trend — `lib/intelligence/churn.ts`
- **Churn probability (0-100):** blends recency (dominant), retention, loyalty, hesitation and the stored `churnRiskScore` — because the audit found `churnRiskScore` is frequently unmaintained (0), the live recency signal makes the figure actually useful. Banded: `safe | watch | at_risk | critical`.
- **Sentiment trend:** reads `CustomerMemory.sentimentHistory` (last 10, previously **zero consumers**) and returns `improving | declining | stable`. Pure functions.

### 2.4 Self-Learning loop — `lib/intelligence/self-learning.ts`
Unlocks the biggest trapped value: `FollowUpTask.repliedAt / convertedAt / revenueImpact` were **written but never read**.
- Aggregates per-follow-up-kind performance (sent / replied / converted / revenue, reply & conversion rates) over a 90-day window.
- Computes a **learned weight** per kind with Bayesian-style shrinkage toward 1.0 on small samples (no over-trusting 2 sends).
- **A/B significance guard** (`evaluateAbSignificance`): a two-proportion z-test + a 20/variant minimum, fixing the existing `/api/broadcasts/ab` behavior of declaring a winner on 1-vs-0. Returns winner only at ~95% confidence.
- Read-only. Surfaced in the dashboard; available to bias future ranking.

### 2.5 Revenue Copilot — `lib/intelligence/revenue-opportunity.ts` + `app/api/revenue-copilot/route.ts`
Closes the "four tabs, no money, no global priority" gap. One bounded pass over active customers produces a **single ranked worklist** where every opportunity has:
- a unified Next Best Action + confidence,
- an **estimated EGP value** (grounded in the merchant's real AOV × value-tier weight × action close-fraction × confidence),
- a global **priority** (NBA priority blended with expected value).

Returns headline pipeline value, high-confidence value, tier distribution, plus the self-learning summary — in one round-trip.

### 2.6 Surfacing (read-only UI)
- **Customer 360 (`inbox/customer-360.tsx`):** a prominent "الخطوة التالية الأفضل" (Next Best Action) card at the top of the overview — action, confidence, copy-able message, value-tier chip, churn band, sentiment trend. Extended the profile API (`/api/customers/[id]/profile`) with an additive `advice` block.
- **New page `/dashboard/revenue-copilot`** ("مساعد الإيرادات"): the ranked worklist + self-learning panel + KPIs. Added to nav under "النمو والذكاء". Every send is manual (anti-ban-safe, same philosophy as `/dashboard/intel`).

---

## 3. Safety & Compatibility

| Guarantee | How |
|---|---|
| No hot-path change | All logic runs at dashboard read-time or in the new API; the message pipeline is untouched. |
| No protected-system edit | No change to send pipeline, queue, billing, safety, commerce, memory writes, or Customer 360 score-write lifecycle. |
| No schema migration | Pure derivations from existing columns; no new tables/columns added. Zero `prisma db push` risk. |
| Backward compatible | `advice` is an **additive** field on the profile response; old clients ignore it. New page is net-new. |
| Fails safe | Every new query is `.catch()`-guarded or bounded; self-learning returns null gracefully; UI handles missing `advice`. |
| Manual-send only | No new automated sends — anti-ban posture preserved. |

---

## 4. Verification

Per CLAUDE.md, the gate before any deploy is **typecheck + build + regression verification**. Status recorded in `KEYONE_FINAL_RECOMMENDATIONS.md` §Verification. (Owner deploys after review, per approved scope.)

---

## 5. Impact Ranking (every completed improvement)

| Improvement | Intelligence | Revenue | Customer | Complexity | Risk |
|---|---|---|---|---|---|
| Unified Next Best Action | very-high | very-high | high | medium | low |
| Self-Learning outcome loop + A/B significance | very-high | high | medium | medium | low |
| Revenue Copilot unified ranking (+ money) | high | very-high | high | medium | low |
| Churn probability + sentiment trend | high | high | high | low | low |
| Customer value tier (LTV) | medium | high | medium | low | low |
| Customer 360 advice card (surfacing) | high | high | high | low | low |

---

## 6. Competitive Read

- **Salesforce Agentforce / HubSpot AI:** their "next best action" + lead scoring are KEYONE's now-unified NBA — but KEYONE's is Arabic-native, WhatsApp-conversational, and merchant-paste-ready.
- **Intercom Fin:** strong auto-reply (KEYONE matches via the existing pipeline); KEYONE adds a revenue-ranked worklist Fin lacks.
- **Attio / GoHighLevel:** KEYONE's value tier + churn + self-learning close the CRM-intelligence gap while staying single-tenant simple.

The differentiator: **one Arabic revenue worklist that learns from its own outcomes**, with zero new infra.

See `KEYONE_FINAL_RECOMMENDATIONS.md` for the top-10 next steps.
