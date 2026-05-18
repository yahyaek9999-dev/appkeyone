# Meta Cloud API Migration Plan

> Replace `whatsapp-web.js` (unofficial, Chromium-per-merchant) with **Meta's
> official WhatsApp Cloud API** (Graph API). Goal: eliminate Chromium RAM
> footprint, reduce ban risk, gain Meta's blessing.

## Current state

- Schema field already exists: `Bot.connectionMode String @default("unofficial")`
  with values `unofficial | official`.
- All production traffic uses `unofficial` (the `whatsapp-service` gateway).
- The official path is **not implemented** in the current code.

## Why migrate

| Pain point (unofficial) | Cloud API benefit |
|---|---|
| ~400 MB Chromium per merchant | Stateless HTTP API |
| Periodic QR re-scan needed | Phone number + access token |
| WhatsApp Inc. can ban at any time | Officially sanctioned |
| Hard to scale horizontally | Just HTTPS — trivial to scale |
| No webhook redundancy | Meta's webhooks have built-in retries |
| 24-hour customer-service window | Templated messages outside window |

## Pain points OF Cloud API

- **Templated messages only** outside the 24h window (after customer's last reply). Marketing broadcasts need pre-approved templates.
- **Per-message cost** (~$0.005-0.05 per message depending on country and message type).
- **WhatsApp Business Account setup** with Meta (phone verification, business verification).
- **Display name approval** by Meta.
- **Templates require approval** (24-48h per template).

## Migration phases

### Phase 0 — Decision criteria
**Migrate when ALL hold:**
- ≥10 active merchants
- A single merchant has been banned at least once (real ban risk realized)
- VPS RAM is over 70% utilized
- The cost of templates per merchant is justifiable

### Phase 1 — Schema additions
Add to `Bot`:
```prisma
metaPhoneNumberId   String?   // Meta's PNID (numeric)
metaWabaId          String?   // WhatsApp Business Account ID
metaAccessTokenEnc  String?   // AES-256-GCM, long-lived token
metaWebhookSecret   String?   // for webhook signature validation
metaTemplatesJson   String    @default("[]") // approved template names + statuses
```

All additive — `prisma db push` safe.

### Phase 2 — Outbound implementation
Create `saas/lib/wa-meta.ts` mirroring the surface of `saas/lib/wa.ts`:
```ts
export const waMeta = {
  send(userId, to, text)         // text via Cloud API
  sendTemplate(userId, to, templateName, params)  // outside 24h
  status(userId)                 // phone health
};
```

Switch dispatch via `Bot.connectionMode`:
```ts
// in lib/wa-dispatch.ts (new)
import { wa } from "./wa";
import { waMeta } from "./wa-meta";
import { prisma } from "./db";
export async function send(userId, to, text) {
  const bot = await prisma.bot.findUnique({where:{userId}, select:{connectionMode:true}});
  return bot?.connectionMode === "official" ? waMeta.send(userId, to, text) : wa.send(userId, to, text);
}
```

### Phase 3 — Incoming webhook
- Configure Meta to call `POST https://app.keyone1.com/api/whatsapp/meta-incoming` on every inbound.
- Implement signature validation using `metaWebhookSecret`.
- Normalize Meta's payload format to the existing internal shape (`{from:{phone,name}, mediaType, text, mediaBase64?}`).
- Forward to the same `incoming/route.ts` handler — no change to business logic.

### Phase 4 — UI for setup
New page `/dashboard/whatsapp/meta-setup` with:
1. Step-by-step instructions for WABA setup
2. Field for `metaPhoneNumberId`, `metaWabaId`
3. OAuth flow for `metaAccessToken` (or manual entry of a permanent token)
4. Template manager (sync with Meta API; show approval status)
5. Toggle: `connectionMode` `unofficial ↔ official`

### Phase 5 — Broadcast templates
- Modify broadcast UI to require selecting a pre-approved template when `connectionMode === "official"`.
- Add template variables binding.
- Reject broadcast creation if no approved template is available.

### Phase 6 — Per-merchant migration
- Pilot on 1 internal account
- Migrate 1-2 willing merchants
- Verify: incoming, outgoing, broadcasts, alerts all work
- Roll out per merchant with explicit opt-in

## Cost model

For 30 merchants × 500 customer-initiated chats/day × 5 bot replies = 75,000 in-window messages/day. In-window is **free** in Meta's model.

Outbound marketing (templates): merchant pays per send. Pricing varies by country:
- Egypt: ~$0.0166 per marketing template
- KSA: ~$0.0316
- UAE: ~$0.0316

A 1000-recipient broadcast in Egypt = ~$17.

This must be passed through to the merchant via the plan (`monthlyMsgs` capped, overage billed).

## What does NOT change

- Safety engine still runs (rate limiting still useful)
- Memory engine, sales engine, KB retrieval unchanged
- Order extraction unchanged
- Database schema only adds fields

## What gets removed (eventually)

After 100% migration:
- `whatsapp-service` Node app (or keep for self-hosted hobbyists)
- `WA_MAX_SESSIONS`, Chromium constraints
- Local auth folders
- QR-scan UI

## Open questions

- **Multi-merchant on one Meta access token?** Each merchant should have their own WABA + token. Plan UI accordingly.
- **Templated daily report?** Currently we send the daily report via WhatsApp text. After 24h window expires, this requires a template. Plan: keep `connectionMode="unofficial"` for daily reports, or design a Meta-approved daily template.
- **Voice/image inbound** — Cloud API delivers media as URLs with auth. Need to fetch+decode in the SaaS path; tweak `lib/media.ts`.
