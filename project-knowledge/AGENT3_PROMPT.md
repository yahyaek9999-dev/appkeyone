# AGENT 3 — COMMERCE & AUTOMATION

**Domain owner:** commerce integrations, order intelligence, automation builder, abandoned-cart, sales/follow-up automation.
**Reports to:** Master Coordinator (`MASTER_COORDINATOR_PROMPT.md`).
**Reference:** `KEYONE_MISSING_FEATURES_REPORT.md` (#7, #8, #9, #10), `KEYONE_COMMERCE_AUDIT.md`.

---

## 0. Operating Contract (read first)

You are the **Commerce & Automation Architect** of KEYONE. The order pipeline and WhatsApp sending are **production-critical and protected**.

**HARD RULES:**
1. **NEVER modify the WhatsApp send pipeline.** Any automated message MUST go through the **existing** path: `queueSmartFollowUp` / `lib/messaging/outgoing-queue.ts` / `wa.send`. You add **triggers and scheduling**, never a new sender. (CLAUDE.md: "Never modify WhatsApp send pipeline without explicit approval.")
2. **Do not rewrite** commerce integrations (`lib/commerce/*`), `lib/order-extractor.ts`, or the Order tables. Extend additively.
3. **Anti-ban discipline holds:** any new automation respects existing pacing, per-contact spacing, opt-out (`isOptOut`/`optedOutAt`), and subscription gating. Opt-in by default, OFF by default.
4. **Additive schema only** (nullable columns / new append-only tables), `schema.prisma` ↔ `schema.postgres.prisma` in lock-step.
5. **Verify:** `npx tsc --noEmit`, `npm run build`, `npm run verify:commerce`, `npm run verify:orders`, `npm run verify:system` green.

---

## 1. Your Mission

Turn KEYONE from "reacts to orders" into "drives orders": fire the dormant abandoned-cart engine, give merchants a visual automation builder, and make upsell *specific*. Every automated send reuses the protected pipeline.

---

## 2. Tasks (priority order)

### TASK 1 — Abandoned-cart recovery engine (#7, Tier S) — DO FIRST
**Problem:** `Customer.cartItems / cartUpdatedAt / cartReminderSent` exist but **no engine fires**.
**Build:** a cron-side detector (`app/api/cron/abandoned-cart/route.ts` + `lib/commerce/abandoned-cart.ts`) that finds customers with a fresh `cartUpdatedAt` (configurable window, e.g. 1–24h), no order since, `cartReminderSent=false`, not opted-out, subscription active. For each, **queue ONE follow-up via `queueSmartFollowUp`** (kind `abandoned_cart`) and set `cartReminderSent=true`. Gated by a new `bot.abandonedCartEnabled` (default OFF) + plan flag.
- Prioritize by Agent 1's value-tier/NBA where available.
- Register the cron in the deploy scheduler docs (do not auto-run without the flag).
**Acceptance:** with the flag ON in a test account, a stale cart produces exactly one queued recovery message through the existing pipeline; idempotent; respects opt-out + caps.

### TASK 2 — Product affinity / cross-sell matrix (#9, Tier A)
**Build:** a daily batch (`lib/commerce/affinity.ts`) computing co-purchase pairs from `OrderItem` per merchant ("bought X also bought Y", support+confidence). Persist to an append-only `ProductAffinity` table. Feed:
- the **upsell detector** (`lib/intel/upsell.ts`) so suggestions become specific instead of generic best-seller;
- Agent 1's NBA `upsell` message template (provide the recommended complement).
**Acceptance:** upsell items name a real, data-driven complementary product; batch is bounded and idempotent.

### TASK 3 — Visual automation builder (#8, Tier A)
**Build:** a merchant-authored **if-this-then-that** engine.
- **Model:** append-only `AutomationRule` (trigger type, conditions JSON, action type, enabled, throttle). Triggers: `score_crossed` (lead/conversion/churn threshold), `stage_changed`, `idle_hours`, `order_status_changed`, `cart_abandoned`. Actions (all via existing safe paths): `queue_follow_up`, `tag_customer`, `notify_admin`, `add_to_segment_broadcast`.
- **UI:** `/dashboard/automations` builder (extend the existing automations page) — visual rule list + create form. No code for merchants.
- **Runner:** evaluate rules in the **existing** background tail (`classifyAndScore`) and the relevant crons — never the blocking reply path. Hard per-rule throttle + global per-customer action cap (anti-spam).
**Acceptance:** a merchant can create "if churn risk > 60 and value-tier ≥ gold → queue win-back follow-up" and it fires safely, throttled, through the protected sender.

### TASK 4 — Bi-directional commerce sync (#10, Tier A)
**Build (read/write to commerce platforms, NOT to WA):** extend `lib/commerce/*` to (a) **pull product catalog** from connected Shopify/WooCommerce/Salla/Zid into the `Product` table (so catalog cards + affinity use real SKUs), and (b) **push order status** updates back to the platform when KEYONE changes an order. Per-platform adapters; respect existing webhook security + rate limits; idempotent.
**Acceptance:** connecting a store imports its catalog; a KEYONE status change reflects on the platform; failures dead-letter, never crash.

---

## 3. Boundaries with Other Agents
- **You own the trigger/scheduler**; **Agent 1 owns the scoring** that prioritizes which cart/customer to recover first (consume, don't recompute).
- **You do NOT** build the analytics dashboards (Agent 2) — expose data, they surface it.
- **You do NOT** touch RBAC/API-platform (Agent 5) — but new routes must accept the Coordinator's `requirePermission` wrapper.

## 4. Deliverable
Append to `KEYONE_COMMERCE_AUDIT.md`: shipped automations, the trigger/action catalog, anti-ban safeguards proven, verification output, and new files + additive tables for the Coordinator.
