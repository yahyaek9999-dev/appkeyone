# KEYONE — Current State Audit (PHASE 0)

**Generated:** 2026-06-03
**Author:** Autonomous AI transformation pass (executive + Chief AI Scientist mode)
**Method:** Full read of codebase (49→50 Prisma models, ~110 lib files, 27 dashboard pages), all project-knowledge reports, plus a 9-agent parallel subsystem audit + cross-cutting synthesis.

> Purpose of this document: establish **what already exists and works** so we do **not** rebuild it, and isolate the **genuine high-value additive gaps** that raise intelligence / conversion / revenue / retention. This is the contract for the rest of the transformation.

---

## 0. Executive Summary

KEYONE is **far more intelligent than a greenfield build would assume.** The "AI engines" the transformation brief asks to build are, in large part, **already implemented** as fast, rule-based, backward-compatible engines that run on the message hot path and persist scores to the DB. The correct strategy is therefore **NOT** to rebuild engines, but to **fuse, rank, learn from, and surface** the intelligence that already exists — plus fill a small number of true gaps.

**The single most valuable finding:** outcome data for self-learning is **already being written** (`FollowUpTask.repliedAt`, `convertedAt`, `revenueImpact`; `Broadcast` A/B variants) but has **zero consumers**. This is pure trapped value.

---

## 1. Engine-by-Engine Status (vs. the transformation brief)

| Brief Engine | Status | Existing Implementation |
|---|---|---|
| **Intent Detection** | ✅ Already built | `analyzeCustomerMessage()` (`lib/sentiment.ts`) → intent enum; `classify()` local-first + LLM fallback (`lib/insights.ts`). Persisted: `Customer.lastIntent`, `Message.intent`. *Gap: no per-intent confidence (0-100).* |
| **Emotion Detection** | ✅ Already built | `analyzeCustomerMessage()` → anger/frustration/urgency/confidence (0-100), sentiment enum, `frustrationLoop`, `severity`. Persisted on `Message` + `Customer`; `CustomerMemory.sentimentHistory` (last 10). *Gap: no trend vector.* |
| **Sales Stage** | 🟡 Partial | Proxied by `classifyPsychology()` (hot/warm/cold/price_sensitive/impulse/hesitant) + cohort funnel (`lib/analytics/funnel.ts`, a computed view). *Gap: no per-customer explicit stage + stage-entered-at + time-in-stage.* |
| **Customer Value Scoring** | ✅ Already built | `scoreLead()` → `Customer.leadScore`; plus `totalOrderValue`, `orderCount`, `loyaltyScore`, `retentionScore`; true facts via `getOrderRollup()`. *Gap: no LTV value-tier (bronze/silver/gold).* |
| **Lead Temperature** | ✅ Already built | `classifyPsychology()` + `leadScore` thresholds; `detectHotLeads()` urgency 0-100. |
| **Objection Detection** | ✅ Already built | `detectSignals().objections{price,trust,shipping,quality}` (Arabic lexicons); `objectionCount` in `NegotiationState`. *Gap: no overcome-vs-persisting sequence.* |
| **Next Best Action** | 🟡 Partial | Tactical pieces exist — `chooseMode()` PersuasionMode, `selectCta()`, `suggestFollowUp()`. Merchant-facing recommendation exists only at daily-report aggregate (`recommend()`). *Gap: no unified per-customer merchant action + confidence.* |
| **AI Follow-Up** | ✅ Already built | `queueSmartFollowUp()` + `processFollowUpTask()`, 5 kinds, priority, rule-based + LLM, subscription-gated through the protected `wa.send` pipeline. Outcome fields captured. |
| **Conversation Quality** | 🟡 Partial | Per-message signals (`memoryConfidence`, `looksLikeGap()`, per-msg sentiment/anger). *Gap: no aggregate conversation quality grade.* |
| **Revenue Opportunity** | ✅ Already built | `computeConversionScore()`, `deriveMerchantSignals()`, 4 intel detectors (urgency 0-100). *Gap: only upsell attaches money; no unified revenue ranking.* |
| **Customer Twin** | ❌ Missing | No lookalike/cohort-similarity. (Segments cluster into 9 fixed buckets but no per-customer twin.) |
| **Memory** | ✅ Already built | `lib/memory.ts` rolling Arabic summary + structured facts + confidence + sentiment history. **Do-not-touch.** |
| **Self-Learning** | 🟡 Partial | Outcome data **written but never consumed** (`FollowUpTask.repliedAt/convertedAt/revenueImpact`, `Broadcast` A/B). A/B winner has no significance guard. *Biggest trapped-value gap.* |
| **Revenue Copilot** | ✅ Already built | `computeForecast()` least-squares + seasonality (`lib/analytics/forecast.ts`); `/api/revenue-forecast`. *Gap: linear-only, no promo-lift.* |
| **Autonomous Growth** | ❌ Missing | Cart fields (`cartItems/cartUpdatedAt/cartReminderSent`) exist but no engine fires; no closed-loop sequencing. |

---

## 2. Completed Systems (DO NOT rebuild)

- WhatsApp send/receive pipeline (queue, pacing, retry, idempotency, safety/anti-ban).
- AI Arabic reply generation (multi-provider, humanized, memory-aware) — `lib/llm.ts`, `app/api/whatsapp/incoming/route.ts`.
- Emotion / intent / objection / psychology / persuasion / negotiation engines.
- Customer memory engine (`lib/memory.ts`).
- Conversion + hesitation + retention/loyalty/churn-field scoring.
- Smart Intel detectors (hot leads, lost customers, upsell, follow-up ops).
- Revenue forecast + daily insights + customer segmentation (9 segments).
- Broadcasts (CRUD, AI generate, A/B, optimize), Recovery, Coupons, Products.
- Commerce integrations (Shopify, WooCommerce, Salla, Zid).
- Customer 360, escalation lifecycle, RBAC/team-member scoping, plan gating.

## 3. Partially Complete (additive opportunity)

- Next Best Action (unify), Sales Stage (make per-customer explicit), Conversation Quality (aggregate grade), Self-Learning (consume outcome data), Revenue Opportunity (attach money + rank).

## 4. Missing (net-new, additive)

- Customer value tier / LTV classification, churn probability (0-100), sentiment trend, Customer Twin, autonomous cart-abandonment trigger, product-affinity cross-sell.

---

## 5. DO-NOT-TOUCH Boundary (consolidated)

1. **Billing/subscription/usage:** `Subscription.*Used` atomic increments, `incrementUsage()`, `checkLimit()` reset logic, `usage-ledger`, `recordUsage`.
2. **WhatsApp send pipeline:** `wa.send()/sendNow()`, `lib/messaging/outgoing-queue.ts` claim/idempotency/retry/pacing — never bypass or add a parallel send path (CLAUDE.md hard rule).
3. **Safety / anti-ban:** `lib/safety/*` state writes via `patchState`/`incrementCounters`; warmup stage progression.
4. **Job queue + broadcast cron:** `lib/queue/*`, `app/api/cron/broadcasts/route.ts` atomic claim + drift guard.
5. **Customer 360 core + score WRITE lifecycle:** scores are written by the pipeline; the dashboard/intelligence layer **reads** them, never recomputes/overwrites.
6. **Commerce/order integration:** `lib/commerce/*`, `lib/order-extractor.ts`, Order tables + order→conversation linkage.
7. **Memory + negotiation merge:** `lib/memory.ts`, `persistNegotiationState()`, `applySignalsToNegotiation()`.
8. **Schema foundation:** changes only via **additive nullable columns** or **new append-only tables** (`prisma db push`).

---

## 6. Strategy Verdict

Build a **read/derive intelligence layer** on top of the existing scores — the lowest-risk, highest-leverage path:

1. **Unified Next Best Action** engine (per customer) — fuses conversion + psychology + signals + negotiation + idle into one action + confidence.
2. **Self-Learning loop** — consume already-written outcome data; add A/B significance guard; feed weights back into follow-up priority + NBA confidence.
3. **Revenue Opportunity ranking** — attach estimated deal value to all detectors; dedupe a customer across detectors; one prioritized merchant worklist (**Revenue Copilot**).
4. **Churn probability + sentiment trend + value tier** — pure derivations from stored fields.

All four are **read-only derivations** (no hot-path change, no protected-system edits), gated behind a dark-launch env flag + per-plan feature flag.

See `KEYONE_AI_INTELLIGENCE_TRANSFORMATION_REPORT.md` for what was implemented.
