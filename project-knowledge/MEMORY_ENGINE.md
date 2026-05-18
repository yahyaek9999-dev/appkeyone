# Memory Engine

> Code: `saas/lib/memory.ts` (371 lines).
> DB: `CustomerMemory` (1:1 with Customer).

## Purpose

Give the bot persistent, **token-cheap** memory of each customer without
changing the model or core architecture.

Stored per Customer:
- `summary` — rolling short Arabic summary (~200-500 chars)
- `factsJson` — structured facts (products, sizes, colors, budget, objections, tone, negotiation state, ...)

Both are injected into the system prompt via `buildMemoryBlock(snap)` →
`buildMessages({...memoryBlock})`.

## Update cadence

**Once every `MEMORY_EXTRACT_EVERY` inbound messages** (default 20, env-tunable).

- Counter (`pendingCount`) is bumped on every inbound msg via `triggerMemoryUpdate`.
- When it crosses 20, a background LLM extraction runs (`EXTRACT_TIMEOUT_MS=25s` hard cap).
- The extracted JSON is parsed → merged into `factsJson` → new `summary` written.
- `pendingCount` resets, `messageCount` accumulates.

**Cost:** ~1 extra LLM call per 20 messages → ~5% overhead on chatty conversations.

## In-flight deduplication

```ts
const inflight = new Set<string>();
```

If the same `customerId` is already being extracted, the new trigger is
dropped silently. In-process Set; resets on restart. Acceptable because a
missed extraction just runs the next time the threshold is crossed.

## Fire-and-forget

`triggerMemoryUpdate({customerId, conversationId})` is called from the hot
path at `incoming/route.ts:451`:
```ts
triggerMemoryUpdate({...}).catch(() => {});
```

Never blocks the reply. If the LLM is slow or unavailable, the bot answers
without updated memory; next trigger tries again.

## What gets remembered (`MemoryFacts`)

```ts
type MemoryFacts = {
  products?: string[];     // ["تيشيرت قطن", "بنطلون جينز"]
  sizes?: string[];        // ["L", "32"]
  colors?: string[];       // ["أسود", "أزرق"]
  budget?: number;         // 500 (EGP)
  frequency?: string;      // "first-time" | "occasional" | "frequent"
  tone?: string;           // "calm" | "warm" | "impatient" | "skeptical"
  objections?: string[];   // ["price", "shipping"]
  negotiation?: string;    // "none" | "soft" | "hard"
  lastTopics?: string[];   // recent conversation themes
};
```

## Big win: history truncation

When `summary` is present, `buildMessages` truncates conversation history
from 20 messages → 8 messages. Combined with the cached summary, the prompt
is significantly shorter on long conversations. **Net token savings often
exceed the cost of the extraction call.**

## Reading memory

`loadMemory(customerId)` is called in parallel with `retrieveRelevantKb` at
`incoming/route.ts:323-326`:

```ts
const [knowledgeBase, memorySnap] = await Promise.all([
  retrieveRelevantKb(userId, messageText, {k:4, charBudget:3500}),
  loadMemory(customer.id),
]);
const memoryBlock = buildMemoryBlock(memorySnap);
```

Never throws. Returns `EMPTY = {summary:"", facts:{}, hasSummary:false}` if no row.

## Pitfalls

1. **Don't make the extractor synchronous.** It would add 1-3 seconds to the reply on every 20th message.
2. **Don't lower `EXTRACT_EVERY` below 5.** You'll spam LLM calls and lose the cost win.
3. **Don't store PII beyond what's already in chat.** Facts JSON is logged in admin views.
4. **Memory is per-customer, not per-conversation.** Even if the customer starts a new chat thread (unlikely in WhatsApp), the memory persists.

## Negotiation state lives here too

The sales engine writes `factsJson.negotiation = { rounds, lastFloor, state }`
via `persistNegotiationState` in `incoming/route.ts:855-885`. See
`SALES_ENGINE.md` for details.

## Manual inspection

Open `/dashboard/customers/[id]` to see the resolved `summary` + facts in
a humane view. There's no direct UI to edit the memory; if needed, do it via
Prisma Studio or a SQL update — but **never** clear summary in a way that
also unsets `messageCount`, or the next extraction will re-summarize from
scratch.
