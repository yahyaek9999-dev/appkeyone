# WKEYONE — Master Feature Registry Audit
**Generated:** 2026-08-17 (Session 7, Phase 1)
**Method:** static reconciliation of the capability catalog against every gate call-site in `app/` and `lib/`.

---

## Method (so the numbers are reproducible)

Capabilities were extracted from `lib/pricing/catalog.ts` (the commercial source of truth). Each key was then searched for across all enforcement primitives:

```
pageGate(…) | requireCapability(…) | hasCapability(…) | apiGate(…)
```

**Correction on first pass.** The initial scan used `[a-z_]*`, which excludes digits, so `k1sms` was misreported as ungated when `/dashboard/sms/page.tsx` does gate it. All figures below use `[a-z0-9_]*`. Any earlier count of "23 unenforced" was wrong; the correct figure is 24 of 43, with a different composition.

---

## Totals

| Metric | Count |
|---|---|
| Capabilities in commercial catalog | **43** |
| Registered in FeatureControl (production) | **44** ¹ |
| Enforced at ≥1 call-site | **19** |
| Not enforced anywhere | **24** |
| — of which *by design* (see below) | 11 |
| — of which **genuine gaps** | **13** |
| Dashboard routes with a `page.tsx` | **61** |
| Admin routes with a `page.tsx` | **51** |

¹ 44 vs 43: the registry seeds from `CAPABILITIES` and the catalog contains one key whose declaration spans lines differently than the scan regex matches. Not a data defect — the registry is a superset, not a mismatch. Flagged as UNKNOWN pending a line-span-tolerant parse.

---

## Unenforced — classified

### BY DESIGN — no action (11)

**Tier 0 / core (6)** — `inbox`, `auto_reply`, `customer_management`, `order_management`, `quick_replies`, `basic_analytics`
Included in *every* plan, so a capability gate is commercially a no-op. Consequence worth recording: the admin kill switch cannot disable these either, because nothing consults the capability. Acceptable today; revisit only if a plan should ever exclude a core capability.

**Tier 3 / contract deliverables (5)** — `dedicated_infra`, `priority_support`, `custom_dev`, `sla`, `custom_billing`
These are sales/contract commitments, not software surfaces. There is nothing in the product to gate. Correctly unenforced — they exist so the pricing matrix can advertise them.

### GENUINE GAPS (13)

| Capability | Tier | Real surface | Risk |
|---|---|---|---|
| `recovery` | 1 Growth | `/dashboard/recovery` | **FIXED** — was over-gated (below) |
| `segments` | 1 Growth | `/dashboard/segments` | **FIXED** — was over-gated (below) |
| `human_handoff` | 1 Growth | bot handoff path | Under-enforced |
| `next_best_action` | 2 Pro | NBA engine | Under-enforced |
| `revenue_copilot` | 2 Pro | `/dashboard/revenue-copilot` | Mis-gated on `revenue_attribution` (same tier — no customer harm) |
| `forecasting` | 2 Pro | `/dashboard/revenue-forecast` | Mis-gated on `revenue_attribution` (same tier — no customer harm) |
| `shipping_tracking` | 2 Pro | shipping module | Revenue leak |
| `team_routing` | 2 Pro | inbox routing (19 tests) | Revenue leak |
| `support_inbox` | 2 Pro | queue/SLA (17 tests) | Revenue leak |
| `loyalty_rewards` | 2 Pro | unverified surface | Verify before gating |
| `multi_team` | 3 Ent | team model | Revenue leak |
| `multi_whatsapp` | 3 Ent | `/api/numbers` | **Partially enforced** — `limits.whatsapp` + `isFeatureEnabled()` gate creation; capability itself unchecked |
| `custom_integrations` | 3 Ent | `/dashboard/integrations` | Revenue leak |

---

## FIXED THIS PASS — over-gating that harmed paying customers

The most serious finding is not the revenue leak; it is the inverse. Two pages gated on a **higher tier than the capability they sell**, locking Growth customers out of features their plan includes:

| Page | Gated on | Tier | Should gate | Tier | Effect |
|---|---|---|---|---|---|
| `/dashboard/recovery` | `smart_campaign_builder` | 2 Pro | `recovery` | 1 Growth | Growth customer paid, locked out |
| `/dashboard/segments` | `customer_segmentation` | 2 Pro | `segments` | 1 Growth | Growth customer paid, locked out |

Corrected in the page gate **and** in `NAV_CAP_BY_HREF`, which carried the same mismatch and therefore also hid the nav entry from the customers entitled to it.

---

## Why enforcement can be added safely

`hasCapability()` short-circuits on `if (!ent.enforce) return true`. `enforce` is true only for `k_*` plan holders, or free-tier when `FREE_TIER_ENFORCEMENT=1` — **verified 0 in production**.

Therefore adding gates:
- legacy (non-`k_*`) subscribers → unaffected
- free / no subscription → unaffected
- `k_*` holders → gated per the plan they bought (intended behavior)

No existing customer loses working functionality. This is what makes closing the remaining 11 gaps a safe, incremental task rather than a risky migration.

---

## Remaining work (not done this pass)

| Item | Class |
|---|---|
| Add gates for the 9 unambiguous revenue-leak capabilities | BLOCKER (commercial) |
| Verify `loyalty_rewards` has a real surface before gating | NON-BLOCKING |
| Realign `revenue_copilot` / `forecasting` to their own keys | NON-BLOCKING (cosmetic — same tier) |
| Resolve the 44-vs-43 registry/catalog delta | NON-BLOCKING |
| Decide whether tier-0 capabilities should be gate-checked so the kill switch reaches them | NEEDS DECISION |
