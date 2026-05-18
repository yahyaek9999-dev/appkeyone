# Order Pipeline

> Code: `saas/lib/order-extractor.ts` (281 lines, the regex engine) and
> `saas/app/api/whatsapp/incoming/route.ts:751-853` (`extractAndStoreOrder`).
> DB: `Order`, `OrderItem`, `OrderTimeline` (see `DATABASE_SCHEMA.md`).

## High-level

Orders are **auto-extracted from chat** without any LLM call. The extractor
runs at the end of every assistant reply in the incoming hot path.

## Triggers

The extractor is called in two cases (`incoming/route.ts:485-506`):

1. **`flagged=true`** — the customer's message contained an order/payment keyword. The bot's `Bot.orderKeywords` (default Arabic CSV: "اوردر,طلب,حولت,تحويل,دفعت,انستاباي,فودافون كاش,فيزا,ايصال") is matched against the message text.
2. **Background unconditional scan** — runs anyway. The pipeline writes only if `confidence >= 50` (looser threshold for flagged messages).

This catches both:
- "حولت 350 جنيه فودافون كاش" (flagged) → low confidence still saves
- "عاوز اللي شفته" → "السعر 250" (not flagged) → only saves if confidence high

## Confidence threshold

```ts
if (!args.flagged && draft.confidence < 50) return;
```

Score-building is in `lib/order-extractor.ts`. Each detected field
contributes a few points; product + price together usually clear 50.

## What gets extracted

- `items[]`: name, size, color, quantity, unitPrice, lineTotal
- `customerName`, `customerPhone` (regex on the message text)
- `shippingAddress` (looks for ADDRESS_HINTS lexicon)
- `paymentMethod` (`cod | instapay | vodafone_cash | card | bank_transfer`)
- `subtotal`, `shipping`, `discount`, `total`, `currency` (default `EGP`)
- `notes` (short Arabic merchant-facing explanation)
- `confidence` (0-100)

## Persistence flow

```ts
const draft = extractOrderFast({...});
if (!flagged && draft.confidence < 50) return;  // gate
// dedupe: same customer, same total, last 30 min → skip
if (dup) return;
bump("order_extracted", args.userId);
await prisma.order.create({...});
```

Every order also writes two `OrderTimeline` rows:
1. `kind="created"` — "تم إنشاء الطلب تلقائياً من المحادثة."
2. `kind="ai_extracted"` — the draft's own notes + payload with confidence

## Dedupe (last 30 min)

```ts
const cutoff = new Date(Date.now() - 30 * 60_000);
const dup = await prisma.order.findFirst({
  where: { userId, customerId, status: "pending", total: draft.total, createdAt: { gte: cutoff } },
});
if (dup) return;
```

This prevents the same conversation from creating multiple identical
"pending" orders as the customer keeps talking.

## Failure handling (audit fix May 2026)

Previously: `catch {}` → silent failure. Orders could vanish.

Now (`incoming/route.ts:833-852`):
```ts
console.error("[orders] persist failed:", e?.message);
await prisma.safetyAudit.create({
  data: {
    userId, level: "warn", category: "orders",
    title: "تعذّر حفظ طلب تلقائي",
    detail: String(e?.message).slice(0, 400),
    payload: JSON.stringify({ customerId, customerPhone }),
  },
});
```

## Statuses

- `pending` (default for auto-extracted) — merchant must review
- `confirmed` — merchant approved
- `shipped`, `delivered`
- `canceled`

`fulfillmentStatus`: `unfulfilled | partial | fulfilled` (independent axis).

## Lexicons used by the extractor

- **Colors** — Arabic + English, normalized (`أحمر/احمر/red`)
- **Sizes keys** — `مقاس|سايز|مقاسه|مقاسي|حجم`
- **Payment** — see PAYMENT_KEYWORDS array (5 methods)
- **Address hints** — `العنوان|شارع|شقه|عماره|دور|محافظه|...`
- **Numerals** — Arabic-Indic + Persian → Western digits via `arNumToWestern`

## Common pitfalls

1. **Aggressive lexicons cause false positives.** Don't broaden BUY_STRONG or OBJ_PRICE without testing on real chats — false orders flood the dashboard.
2. **Quantity is clamped** to [1,99] via `clampQty`. Don't remove.
3. **`flagged=true` but `aiConfidence<30`** — these still save. Merchant sees a "weak" pending order. That's intentional; merchant decides.
4. **`extractOrderFast` is sync.** Don't make it async/LLM-backed; it runs on every assistant reply.

## Recommended monitoring

- `/admin/metrics` → `order_extracted` daily count
- `/dashboard/orders` filter by `aiConfidence < 50` → check false positives
- `SafetyAudit (category="orders", level="warn")` → DB errors
