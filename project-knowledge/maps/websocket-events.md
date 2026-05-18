# WebSocket / Real-time Events

## TL;DR — there are no WebSockets in this codebase.

All real-time-feeling features are implemented via:
1. **HTTP polling** from the dashboard UI
2. **Server-to-server HTTPS** (wa-service → SaaS via `/api/whatsapp/incoming`)
3. **Direct WhatsApp Web protocol** between `whatsapp-web.js` and WhatsApp servers (internal to wa-service)

## What "looks like" real-time

### Live inbox view (`/dashboard/inbox`)
The merchant's UI shows incoming customer messages "in real time." Mechanism: the page polls `GET /api/inbox/conversations` and `GET /api/inbox/conversation/[id]` periodically. **No WebSocket.**

If you need true real-time without polling, consider adding **Server-Sent Events** at `/api/inbox/stream` — simpler than WebSockets and works through Caddy without special config.

### WhatsApp QR
`/dashboard/whatsapp` polls `GET /sessions/:userId/status` every few seconds while pairing. The QR string is returned in the response body, base64-encoded.

### Broadcast progress
`/dashboard/broadcasts/[id]` polls `GET /api/broadcasts/[id]` to show `sent/failed/total` progress.

## Real-time events INSIDE wa-service

`whatsapp-web.js` exposes events on its `Client` instance (line ~150 of `sessions.js`):

| Event | Handler outcome |
|---|---|
| `qr` | Save QR string on session row; SaaS polling sees it |
| `ready` | Mark session ready; fire `connected` webhook to SaaS |
| `message` | Decode → POST to SaaS `/api/whatsapp/incoming` |
| `auth_failure` | Log + retry connect |
| `disconnected` | Log + attempt re-connect |
| `change_state` | Status updates (forwarded to SaaS on transitions) |

These are **internal** to wa-service. The SaaS sees them only through the HTTP webhook contract.

## Webhook contract (wa-service → SaaS)

`POST /api/whatsapp/incoming` with body shape:

### Event: `connected`
```json
{
  "event": "connected",
  "userId": "<merchant user id>",
  "phone": "+201XXXXXXXXX"
}
```
SaaS updates `Bot.whatsappStatus = "connected"`, `Bot.whatsappPhone = phone`.

### Event: `incoming`
```json
{
  "event": "incoming",
  "userId": "<merchant>",
  "from": { "phone": "<E.164>", "name": "<optional>" },
  "mediaType": "text" | "voice" | "image",
  "text": "<message text or caption>",
  "mediaBase64": "<base64 of binary if voice/image>",
  "mimetype": "audio/ogg | image/jpeg | ..."
}
```
SaaS runs the hot path and returns:
```json
{
  "ok": true,
  "reply": "<text>" | null,
  "preDelayMs": 1500,
  "typingDelayMs": 2800,
  "blocked": "<reason if no reply>",
  "risk": "low",
  "riskScore": 12,
  "warmupStage": "mature"
}
```

wa-service then:
1. Waits `preDelayMs` (silent "read pause")
2. Shows the WhatsApp "typing…" indicator
3. Waits `typingDelayMs`
4. Sends `reply` text

If `reply = null`, wa-service does nothing — the bot stays silent.

## Adding real-time UI features (future)

If you want push notifications to the dashboard (e.g. "new message from customer X"):

1. **Server-Sent Events (SSE)** — easiest. Add `GET /api/inbox/stream`:
   ```ts
   // in route.ts (Node SSE pattern)
   export const dynamic = "force-dynamic";
   export async function GET(req: Request) {
     const stream = new ReadableStream({
       async start(controller) {
         // subscribe to internal event bus
       }
     });
     return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
   }
   ```
   Pros: works through Caddy, no special server config, dead-simple JS client.
   Cons: server-to-client only (no client → server messages); per-connection memory.

2. **WebSockets** — would require a separate server or `ws` package (Next.js doesn't ship with WebSocket route support yet). Overkill for our needs.

3. **Polling improvements** — extend the existing pattern with smart intervals (every 2s when tab is active, 30s when idle).

## Caddy configuration for streaming

If we ever add SSE, ensure Caddy is configured to NOT buffer the response:
```caddy
reverse_proxy /api/inbox/stream localhost:3000 {
  flush_interval -1
}
```

Today's Caddyfile doesn't include this — verify before deploying SSE.
