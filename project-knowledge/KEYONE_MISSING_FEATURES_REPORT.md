# KEYONE — Missing Features Report (Full Gap Analysis)

**Generated:** 2026-06-03
**Authored by:** KEYONE leadership (Chief Architect / CPO / Chief AI Scientist / CRO / Enterprise Architect / CEO)
**Method:** Full codebase + schema (50 models) + project-knowledge audit, cross-checked against the live production state and the four reference competitors (Salesforce Agentforce, HubSpot AI, Intercom Fin, Attio, GoHighLevel).
**Companion docs:** `KEYONE_CURRENT_STATE_AUDIT.md`, `KEYONE_AI_INTELLIGENCE_TRANSFORMATION_REPORT.md`, `AGENT3_RELIABILITY_REPORT.md`, `POSTGRESQL_MIGRATION_PLAN.md`, `REDIS_WORKERS_PLAN.md`.

> **Framing.** KEYONE is already a mature, production AI WhatsApp Sales OS. This report deliberately ignores cosmetic and small improvements. It names only gaps that move **intelligence, revenue, conversion, retention, enterprise-readiness, scalability, or competitive moat** — and it is explicit about what **already exists** so the 5 agents never rebuild working systems.

---

## 0. What Already Exists (do NOT rebuild — anti-duplication ledger)

| Domain | Already built | Source of truth |
|---|---|---|
| AI engines | intent, emotion, objection, lead-temp, lead/conversion/hesitation/retention/loyalty/churn scoring, persuasion, negotiation, memory engine | `lib/sentiment.ts`, `lib/sales-engine.ts`, `lib/conversion-engine.ts`, `lib/memory.ts` |
| Intelligence layer (this session) | **Next Best Action, Revenue Copilot, value-tier, churn probability, sentiment trend, self-learning loop, A/B significance** | `lib/intelligence/*` |
| Detectors | hot leads, lost customers, upsell, follow-up ops | `lib/intel/*` |
| Revenue | forecast (regression+seasonality), segments (9), daily insights | `lib/analytics/*`, `lib/daily-report/*` |
| Commerce | Shopify / WooCommerce / Salla / Zid webhooks, order extraction, automations | `lib/commerce/*`, `lib/order-extractor.ts` |
| Messaging | QR + Meta Cloud, outgoing queue (pacing/retry/idempotency), anti-ban, broadcast cron | `lib/messaging/*`, `lib/safety/*` |
| Reliability | `/api/ready`, `/api/internal/wa-health`, verify suite, backup verify, health-gate rollback | `AGENT3_RELIABILITY_REPORT.md` |
| Infra (dormant-ready) | dual-DB (SQLite↔Postgres), BullMQ workers behind `ENABLE_BULLMQ` | `POSTGRESQL_MIGRATION_PLAN.md`, `REDIS_WORKERS_PLAN.md` |
| RBAC | `TeamMember` model + 5-role matrix + team settings UI | `lib/rbac.ts`, `app/dashboard/settings/team` |
| Onboarding | 5-step wizard, self-serve signup w/ waitlist approval | `app/onboarding/wizard.tsx`, `app/api/auth/signup` |

**Rule for all agents:** if it's in this table, you *extend* it — you do not replace it.

---

## 1. Ranked Master Gap List (by business impact)

Impact = weighted blend of revenue + intelligence + retention + enterprise unlock. Effort/Risk noted. **Tier S = transformational, A = high, B = valuable.**

| # | Gap | Domain | Impact | Effort | Risk | Owner Agent |
|---|---|---|---|---|---|---|
| 1 | **Self-learning loop not wired into action selection** (outcomes recorded, weights computed, but follow-up priority & chooseMode don't consume them) | AI | **S** | Low | Low | A1 |
| 2 | **Customer Twin / lookalike intelligence** (predict outcome from similar customers' history) | AI | **S** | Med | Low | A1 |
| 3 | **Memory Graph** (entities/relationships across conversations, not just per-customer rolling summary) | AI | A | Med | Med | A1 |
| 4 | **Activation: no first-value tracking / guided checklist tied to revenue events** (wizard exists but no activation funnel, no "aha" instrumentation) | Product | **S** | Low | Low | A2 |
| 5 | **Conversion instrumentation missing** (no funnel events from signup→WA-connect→first-AI-reply→first-order; can't optimize what isn't measured) | Product | A | Low | Low | A2 |
| 6 | **Mobile-first inbox + PWA** (dashboard responsive but not a true mobile operator experience; merchants live on phones) | Product | A | Med | Low | A2 |
| 7 | **Abandoned-cart engine not firing** (`cartItems/cartUpdatedAt/cartReminderSent` exist; no trigger) | Commerce | **S** | Med | Med | A3 |
| 8 | **Visual automation builder** (rules engine is per-event hardcoded; no merchant-authored if-this-then-that) | Commerce | A | High | Med | A3 |
| 9 | **Product-affinity / cross-sell matrix** (upsell is generic best-seller, not "bought X → suggest Y") | Commerce | A | Med | Low | A3 |
| 10 | **Bi-directional commerce sync** (orders flow in; KEYONE can't push status/fulfillment back, no product catalog pull) | Commerce | A | Med | Med | A3 |
| 11 | **Postgres cutover not executed** (single-file SQLite caps horizontal scale at ~20-25 sessions) | Infra | **S** | Med | High | A4 |
| 12 | **Workers/Redis dormant** (cron-only; no async offload, coarse 60s granularity) | Infra | A | Med | Med | A4 |
| 13 | **No true multi-instance / blue-green** (stop→build→start restart blip; shared-DB blocker until #11) | Infra | A | High | Med | A4 |
| 14 | **Per-merchant cost & performance observability** (no per-tenant LLM/token/latency cost attribution) | Infra | B | Med | Low | A4 |
| 15 | **RBAC not enforced at route layer** (matrix exists; only settings/team page checks it — most APIs ungated) | Enterprise | **S** | Med | Med | A5 |
| 16 | **No unified admin audit log** ("who did what when" — only safety/usage telemetry) | Enterprise | A | Low | Low | A5 |
| 17 | **No public merchant API + developer portal + API keys** (commerce keys exist; no outward platform) | Enterprise | A | High | Med | A5 |
| 18 | **No SSO / SAML / OIDC** (email+password JWT only — blocks enterprise procurement) | Enterprise | B | Med | Low | A5 |
| 19 | **No white-label / per-workspace branding / custom domain** (`SiteConfig` is a global singleton) | Enterprise | B | High | Med | A5 |
| 20 | **No multi-workspace / multi-brand** (one bot per user; single-userId scoping) | Enterprise | B | High | High | A5 |
| 21 | **Rate limiting only on auth** (broadcasts/commerce/admin unprotected → abuse + cost risk) | Enterprise | A | Low | Low | A5 |
| 22 | **No revenue analytics for the merchant's own business** (NRR/repeat-rate/cohort retention dashboards) | Analytics | A | Med | Low | A2/A4 |
| 23 | **Outbound webhooks for merchants** (event stream: new order, hot lead, escalation → merchant systems) | Enterprise | B | Med | Low | A5 |
| 24 | **AI reasoning transparency** (no "why this action" explainability surfaced to build merchant trust) | AI | B | Low | Low | A1 |

---

## 2. Gap Analysis by Category

### 2.1 Missing AI Systems
- **S — Self-learning closed loop.** The substrate exists (`FollowUpTask.repliedAt/convertedAt/revenueImpact`, `lib/intelligence/self-learning.ts`). What's missing is *consumption*: `queueSmartFollowUp` priority and `chooseMode`/NBA confidence should be biased by learned per-kind/per-mode conversion. This is the single highest-ROI AI gap — pure read-only weighting.
- **S — Customer Twin.** No lookalike engine. Given a customer's score vector, find the nearest past customers and their outcomes → "customers like this closed with action X 68% of the time." Per-tenant, isolated.
- **A — Memory Graph.** Memory is per-customer rolling summary. Missing: an entity/relationship layer (products↔customers↔objections↔outcomes) enabling cross-customer pattern queries powering #2 and cross-sell.
- **B — AI reasoning/explainability.** NBA gives an action+confidence but not a transparent factor breakdown. Enterprise buyers and merchant trust both need "show your work."

### 2.2 Missing CRM Systems
- **A — Unified activity audit per customer** beyond timeline (who on the team touched this, role-stamped).
- **A — Customer health score for accounts** (B2B-style account health, distinct from per-conversation churn).
- **B — Bulk CRM actions** (multi-select tag/assign/VIP from the customer list).

### 2.3 Missing Sales Systems
- **S — Cross-sell/affinity targeting** (#9) — turns upsell from generic to specific, directly lifts AOV.
- **A — Pipeline/stage board** (explicit Kanban of customers by sales stage; the funnel is aggregate, not workable).
- **A — Quote/price-negotiation assistant** surfaced to merchant (negotiation state exists; no optimal-next-price suggestion UI).

### 2.4 Missing Retention Systems
- **S — Abandoned-cart recovery** (#7) — fields exist, engine doesn't fire.
- **A — Lifecycle automation** (auto-route at-risk→winback, new→nurture, VIP→concierge) — segments exist, no automation binding.
- **A — Win-back campaign automation** tied to value-tier (protect high-LTV first).

### 2.5 Missing Onboarding Systems
- **S — Activation funnel + first-value instrumentation** (#4/#5). Wizard exists but there's no measurement of time-to-first-AI-reply / time-to-first-order, and no guided checklist that drives those events.
- **A — Interactive product tour + sample-data mode** so a merchant sees value before connecting WhatsApp.
- **B — Onboarding success scoring** (predict which new merchants will activate; intervene early).

### 2.6 Missing Enterprise Systems
- **S — Route-level RBAC enforcement** (#15). The matrix is decorative until every mutating route calls `requirePermission`.
- **A — Admin audit log** (#16), **public API + developer portal** (#17), **rate-limit coverage** (#21).
- **B — SSO** (#18), **white-label** (#19), **multi-workspace** (#20), **outbound webhooks** (#23).

### 2.7 Missing Automation Systems
- **A — Visual automation/workflow builder** (#8) — the competitive table-stakes vs GoHighLevel/HubSpot. Today automations are code-defined per event type.
- **A — Trigger library** (on score-cross, on stage-change, on idle, on order-status) feeding the builder.

### 2.8 Missing Analytics Systems
- **A — Merchant business analytics** (#22): cohort retention, repeat-purchase rate, revenue-by-segment, campaign ROI.
- **A — Self-learning dashboard** surfacing which actions/campaigns actually convert (data now exists via `self-learning.ts`).
- **B — Forecasting upgrades** (promo-lift modeling, scheduled-broadcast boost).

### 2.9 Missing Scaling Systems
- **S — Postgres cutover** (#11), **A — Workers/Redis activation** (#12), **A — blue-green** (#13).
- **B — Read replica for analytics** (unblocked by #11).
- **B — Multi-region / CDN edge** (future, post-Postgres).

### 2.10 Missing Monitoring Systems
- **A — Per-tenant cost/latency observability** (#14) — token spend, LLM latency, send success per merchant.
- **B — SLO dashboards + alerting** (the health endpoints exist; no alert routing/on-call).
- **B — Synthetic end-to-end probes** (scripted "send a WA message, expect AI reply" canary).

---

## 3. Competitive Gap Read

| Capability | KEYONE today | Agentforce | HubSpot AI | Intercom Fin | GoHighLevel | KEYONE move |
|---|---|---|---|---|---|---|
| Next Best Action | ✅ (new) Arabic, WA-native | ✅ | ✅ | partial | ❌ | Wire self-learning (#1) to beat them on *adaptive* NBA |
| Self-learning from outcomes | 🟡 substrate only | partial | partial | ✅ | ❌ | #1 closes & exceeds |
| Visual automation builder | ❌ | ✅ | ✅ | partial | ✅ | #8 = table stakes |
| Multi-channel | WA-deep | omni | omni | omni | omni | Stay WA-deep; that's the moat |
| Enterprise (RBAC/SSO/audit/API) | 🟡 partial | ✅ | ✅ | ✅ | 🟡 | #15-18 unlock upmarket |
| Arabic + MENA commerce depth | ✅ **unique** | ❌ | ❌ | ❌ | ❌ | **Defend & widen this moat** |

**Strategic verdict:** KEYONE's durable moat is **Arabic-native, WhatsApp-deep, MENA-commerce sales intelligence that learns**. Win by (a) closing the self-learning loop, (b) shipping the automation builder + abandoned-cart, (c) making it enterprise-sellable (RBAC/audit/API). Do **not** chase omni-channel breadth — depth is the advantage.

---

## 4. The 5-Agent Decomposition (no overlap)

| Agent | Domain | Owns (from this report) |
|---|---|---|
| **Agent 1** | AI Intelligence | #1, #2, #3, #24 + sales-intelligence depth |
| **Agent 2** | Product & UX | #4, #5, #6, #22 (merchant-facing analytics surfacing) |
| **Agent 3** | Commerce & Automation | #7, #8, #9, #10 |
| **Agent 4** | Infrastructure & Scale | #11, #12, #13, #14 + analytics data layer for #22 |
| **Agent 5** | Enterprise & Security | #15, #16, #17, #18, #19, #20, #21, #23 |

Each agent's detailed brief is in `AGENT{1..5}_PROMPT.md`. Coordination, conflict resolution, and the merge/verify gate are in `MASTER_COORDINATOR_PROMPT.md`. Sequenced rollout + rollback is in `FINAL_DEPLOYMENT_MASTER_PLAN.md`.

---

## 5. Sequencing Principle

Ship **revenue-now, low-risk** first (self-learning wiring, abandoned-cart, activation instrumentation, RBAC enforcement, rate-limit coverage) — none require Postgres. Defer **infra-heavy** items (Postgres cutover, workers, multi-workspace, white-label) behind their documented maintenance-window runbooks. Never let an enterprise-plumbing item block a revenue item.
