# Sales Engine

> Code: `saas/lib/sales-engine.ts` (312 lines).
> Caller: `app/api/whatsapp/incoming/route.ts:329-371`.

## Purpose

Detect buying signals + customer psychology and pick a short Arabic
"sales guidance" block to prepend to the LLM prompt. **Hard budget: ≤120
extra tokens per reply.**

Everything is **rule-based + cheap regex.** No LLM calls. Runs in
O(message length); adds well under 1 ms.

## Gating — when does it run?

Only when ALL three conditions hold (`shouldRunSales` in `sales-engine.ts`):

1. `bot.persuasionEnabled === true`
2. `Customer.leadScore >= 30`
3. `Customer.lastIntent` is `"buy"` or `"inquiry"`

If any condition fails, the engine is **silently skipped** and a metric is
bumped: `bump("sales_skipped", userId)`.

## Signals detected

`detectSignals(text)` returns:

```ts
interface SalesSignals {
  buyStrong: boolean;       // "هاخده", "عاوز", "buy now"
  buyInterest: boolean;     // "بكام", "السعر", "متاح"
  hesitation: boolean;      // "هفكر", "مش متاكد", "later"
  objections: {
    price: boolean;         // "غالي", "expensive"
    trust: boolean;         // "نصب", "scam"
    shipping: boolean;      // "شحن", "متاخر"
    quality: boolean;       // "خامه", "تقليد", "fake"
  };
  discountAsk: boolean;     // "خصم", "افضل سعر"
  urgent: boolean;          // "النهارده", "urgent"
}
```

Lexicons are intentionally **tight**. Broad lists cause false positives that
hurt reply quality.

## Psychology classification

`classifyPsychology({leadScore, lastIntent, signals, facts, negotiation})` maps inputs to
a small set of "customer modes":
- `analytical` — wants detail, comparisons
- `impulsive` — ready to buy, just needs nudge
- `skeptical` — has trust objections
- `bargainer` — focused on price
- `urgent` — time-sensitive
- `hesitant` — needs reassurance

(Exact mapping is in `classifyPsychology()`; the function is small enough
to read once.)

## Mode selection

`chooseMode(psy, signals)` returns one of the persuasion modes:

| Mode | When | What block does |
|---|---|---|
| `fast_close` | `buyStrong` + high leadScore | Push toward immediate close, ask name+phone |
| `premium` | `analytical` or trust-objection | Emphasize quality, social proof |
| `trust` | `skeptical` + trust objection | Show reviews, guarantees |
| `scarcity` | `urgent` | Limited time / limited stock framing |
| `social_proof` | hesitant | "كتير اشتروا" / customer count |
| `value_anchor` | `bargainer` + `discountAsk` | Reframe value, anchor to original price |
| `educate` | `inquiry` + no objections | Answer questions, build understanding |
| `none` | (gated off) | No block added |

## Negotiation state

Stored in `CustomerMemory.factsJson.negotiation`:
```ts
{
  rounds: number,             // how many price-pushbacks
  lastFloor: number | null,   // last discount we offered
  state: "none" | "soft" | "hard"
}
```

Updated in background via `applySignalsToNegotiation(prev, signals)`:
- `discountAsk` + already 2 rounds → escalate to "hard"
- `objections.price` first time → "soft"
- Each round increments and respects `bot.negotiationFloorPct`

**The bot will never quote below `bot.negotiationFloorPct` off the listed
price** (LLM is constrained via the prompt block).

## Observability (May 2026 addition)

```ts
if (salesMode && salesMode !== "none") {
  bump(`sales_mode_${salesMode}`, userId);
}
```

Visible at `/admin/metrics`. Helps the merchant see WHY their AI sales
engine is/isn't firing:
- High `sales_skipped` → most customers don't hit the gate. Maybe lead scoring is too strict, or `persuasionEnabled=false`.
- All sales hits in `educate` mode → no buying signals. Marketing problem, not engine problem.
- Lots of `fast_close` but no orders → check `ORDER_PIPELINE.md` for false negatives.

## Hard rules

- **DO NOT** make this engine async / LLM-backed. It runs on every reply.
- **DO NOT** broaden BUY_STRONG to include "ايه" or other very-common words.
- **DO NOT** lower the gating threshold (`leadScore >= 30`) without confirming you don't see a flood of `sales_mode_*` on tire-kickers.
- **DO NOT** persist negotiation deltas synchronously. Background only.

## Adding a new mode

1. Add to `chooseMode` selection logic.
2. Add an Arabic block in `buildSalesBlock(mode)` — keep under 120 tokens.
3. Add a unit-style test (manual) by sending a chat that triggers your conditions in dev.
4. Watch `/admin/metrics` for the new `sales_mode_<yourmode>` counter.
