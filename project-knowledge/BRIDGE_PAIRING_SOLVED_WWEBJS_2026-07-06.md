# KEYONE Bridge — WhatsApp pairing SOLVED with whatsapp-web.js (2026-07-06)

## Root cause (proven with a controlled 3-library experiment, same phone/IP/moment)

The Bridge (whatsmeow) QR scanned but **never completed pairing** — WhatsApp issued
refs, showed the QR, kept the socket alive (keepalive IQs answered), but sent **no
`pair-success`**; every sequence ended in `Ran out of QR codes → timeout`. No
rejection node — silent non-completion.

| Client | Kind | Result (same iPhone / number 201227704155) |
|---|---|---|
| whatsmeow `v0.0.0-20260630` | Go protocol reimpl | scan → timeout, no pair-success |
| Baileys `7.0.0-rc11` | Node protocol reimpl | scan → `QR refs attempts ended`, 408 |
| **whatsapp-web.js `1.34.7`** | **real Chromium / actual WhatsApp Web** | **AUTHENTICATED → READY, paired** ✅ |

Verified from BOTH an AWS datacenter IP and the customer's residential IP (Egypt TE
Data) with a healthy socket. → **WhatsApp refuses to complete companion pairing for
reimplemented multi-device clients on this account, but accepts the genuine web
client.** This is exactly why the existing Recovery/Import flow (whatsapp-web.js,
`whatsapp-service/src/sessions.js`, Chromium) always worked and the Bridge never did
— and why Recovery takes a few seconds (real browser init) while the reimplemented
QR appeared instantly.

## Fix — new transport, unchanged contract

**`bridge-node/keyone-wa-bridge.js`** — Bridge transport rebuilt on whatsapp-web.js.
Speaks the **identical gateway WebSocket protocol** as the Go bridge (`hello`,
`heartbeat`, `state`, `link_artifact`, `inbound`, `log` up; `control`, `outbound`
down; token on WS upgrade; PKCE S256 device-code login), so **the gateway and the
Dashboard are unchanged**. Real Chrome via `KEYONE_CHROME` executablePath (falls back
to bundled puppeteer). LocalAuth session persists → restart restores without QR.

## Verified end-to-end on production (bridge `cmr9kteet…`, account yahyaemad999)

- Real scan → `AUTHENTICATED → READY 201227704155@c.us` (device in Linked Devices)
- Session saved (LocalAuth 106 MB); **restart → connected, NO QR**
- Node bridge → production gateway: `bridges:1`, status online, `wa_state=connected`,
  identity 201227704155 — **Dashboard shows "واتساب متصل / Connected"** (screenshot)
- **Send through the full pipeline**: `POST /internal/outbound` → gateway →
  Node bridge → wwebjs → WhatsApp → `{ok:true, providerMessageId:…}`

## Remaining productionization (next phase)

1. **Packaging**: ship Node + `keyone-wa-bridge.js` + Chromium (or system-Chrome
   detection) cross-platform (Win/mac/Linux). Bigger footprint than the Go binary
   (~Chromium), but it is the only engine that pairs. Replaces the Go/whatsmeow
   binary in the download store + auto-updater.
2. **Dashboard fresh-QR scan**: the QR-display path is wired (wwebjs `qr` →
   `link_artifact`, verified engine pairs); run one scan through the live Dashboard
   for the final on-rails proof.
3. **Inbound**: handler wired (`message` → `inbound`); confirm with a real reply.
4. Retire the Go whatsmeow transport for WhatsApp (keep the provider abstraction).

Files: `bridge-node/keyone-wa-bridge.js`, `bridge-node/package.json`. Proven config
mirrors `saas/workers/baileys.worker.js` + `whatsapp-service/src/sessions.js`.
