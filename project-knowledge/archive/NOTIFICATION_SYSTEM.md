# Notification System

> Code: `saas/lib/notify.ts` (166 lines).
> Callers: `app/api/whatsapp/incoming/route.ts:476` (order alert), `incoming/route.ts:733` (anger alert), various follow-up paths.
> Persistence: `SafetyAudit` (category=`notify`).

## Three notification types

1. **Order alert** (`notifyMerchant`) — fired when an inbound message hits `Bot.orderKeywords`. Header: `🔔 *تنبيه طلب جديد*`.
2. **Anger alert** (`notifyAdmin` with `category="anger"`) — fired when `classifyAndScore` returns `sentiment="angry"` or `"negative"`. Header: `🚨 عميل غاضب` or `⚠️ عميل غير راضٍ`.
3. **Generic admin alert** (`notifyAdmin`) — any other admin-facing alert (broadcast failures, follow-up errors, etc.).

## Phone resolution chain

`resolveNotifyPhone(userId)` returns the first non-empty value of:

```
bot.notifyPhone → bot.whatsappPhone → user.phone
```

This is the **canonical** chain. Before May 2026, callers used `bot.notifyPhone`
only — and merchants who hadn't set a dedicated alert number got zero alerts.

## Self-send guard

```ts
async function isOwnWhatsappNumber(userId, phone) {
  const bot = await prisma.bot.findUnique({...});
  // compare on trailing 9 digits (handles + and country-code variance)
  return bot.whatsappPhone.replace(/\D/g,"").slice(-9) === phone.replace(/\D/g,"").slice(-9);
}
```

If the alert destination is the same WhatsApp number that hosts the bot,
the send is **refused** and a warn-level audit row is written:

> "رقم تنبيه الطلبات هو نفس رقم الواتساب المتصل بالبوت. واتساب لا يسمح بإرسال رسالة لنفس الرقم."

This prevents a common config mistake from generating cryptic "send failed"
errors in the logs.

## Audit logging

**Every** failure path writes a `SafetyAudit` row:

| Trigger | Level | Title |
|---|---|---|
| No phone resolved | warn | "تعذّر إرسال تنبيه (لا يوجد رقم)" |
| Self-send guard | warn | "تعذّر إرسال تنبيه" |
| WA send failed | warn | "فشل إرسال تنبيه" |
| Order-alert no phone | warn | "تعذّر إرسال تنبيه الطلب" |

Payload always includes `{ toPhone, kind }`. Merchants see these at
`/admin/safety` (filter by category=`notify`).

## Fire-and-forget contract

Notifications **never block** the customer reply. The hot path uses
`.catch(() => {})` everywhere:

```ts
notifyMerchant({...}).catch(() => {});
```

If WA gateway is slow, the audit shows the failure, but the customer still
receives the bot reply on time.

## When notifications DON'T fire

- `Bot.alertEnabled === false` (per-bot toggle)
- `Bot.notifyPhone` empty AND `Bot.whatsappPhone` empty AND `User.phone` empty
- WA service is down / returns non-OK
- Self-send guard hits (intentional)

All of these write audit rows so the merchant has visibility.

## Adding a new alert type

1. Call `notifyAdmin({ userId, toPhone, text, category: "your_category" })`.
2. If the caller doesn't have a phone, call `resolveNotifyPhone(userId)` first.
3. **Always** `.catch(() => {})` the call.
4. **Always** mention the category in the audit (the function does this for you).
5. Don't `console.log` the alert content (PII concerns); the `notify.ts` already
   logs minimal info on failure.
