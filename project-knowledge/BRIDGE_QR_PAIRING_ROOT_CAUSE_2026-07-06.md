# KEYONE Bridge — WhatsApp QR pairing failure: root cause & fix (2026-07-06)

**Symptom (customer):** QR displays in the Dashboard, but scanning it with WhatsApp
on iPhone immediately shows **"Check your connection and try again."** Pairing never
completes.

This is a real production diagnosis on the live box (`13.63.79.43`), traced end‑to‑end
from Dashboard → Bridge → whatsmeow → WhatsApp servers using the production DB, the
gateway journal, and the Bridge's own logs streamed to `BridgeLogLine`.

---

## Evidence (not assumptions)

Bridge `cmr9c2wt30003…` connected (`bridges:1` on the gateway) and streamed logs:

```
14:47:18 dashboard control received: start_qr (whatsapp)
14:47:18 streamed qr link artifact           ← QR #1
14:48:18 streamed qr link artifact           ← QR #2 (+60s)
14:48:39 streamed qr link artifact           ← QR #3 (+21s)
14:48:42 start_qr failed: qr channel: GetQRChannel must be called before connecting   ← re-click
14:49:00 streamed qr link artifact
14:49:03 start_qr failed: qr channel: GetQRChannel must be called before connecting   ← re-click
14:49:18 / 14:49:39 streamed qr link artifact
14:50:00 whatsapp: QR link timed out
14:50:00 [whatsmeow/Socket] … failed to read frame header: EOF
```

Every link session ended in whatsmeow **`timeout`** with **zero `pair-success`**.
whatsmeow's own doc: *"QRChannelTimeout is emitted … if the socket gets disconnected
by the server before the pairing is successful."* → **no scan ever completed
server‑side pairing with the Bridge's companion.**

Exact QR string stored/displayed (prod DB, verbatim):

```
https://wa.me/settings/linked_devices#2@W0tQCGtsrpkF…,IHGS…,DS5N…,gn60…,9
```

---

## Ruled OUT (verified, not the cause)

- **QR content / URL format.** The `https://wa.me/settings/linked_devices#…` wrapper
  is produced by whatsmeow itself (`makeQRData`, `pair.go:119`) and is the **correct
  current format** — whatsmeow `main` returns the identical form, so thousands of
  deployments pair with it. The Dashboard encodes the string **unmodified**
  (`qr-code.tsx`, `QRCode.toDataURL(data)`). The QR is valid and scannable.

## ROOT CAUSE — the Dashboard showed a QR that was already dead

whatsmeow rotates the linking code every ~20s (first code 60s, then 20s each) and,
when the ~2.5‑min sequence expires with no scan, **disconnects its socket** — after
which **no companion is listening for any of the codes that were shown.**

The Bridge computes and streams each code's **real expiry**
(`whatsapp.go:141 ExpiresAt` → `LinkArtifactPayload.ExpiresAt` → gateway receives
`p.expiresAt`). **But the gateway's `persistQr` dropped `expiresAt` when writing to
the DB** (`bridge-gateway/index.js`). With no real expiry, the Dashboard fell back to
a **fixed 60s TTL** (`overview.ts QR_TTL_MS`) and a **60s countdown**
(`control-center.tsx QrPanel`).

Net effect: the UI told the customer a code was valid for up to 60s (and kept showing
the last code for up to 60s **after the whole session had timed out and the socket
was gone**). Following that countdown, the customer routinely scanned a code that
whatsmeow had already rotated past or a session already dead → WhatsApp cannot hand
the pair to a waiting companion → **"Check your connection and try again."**

### Secondary bug (confirmed)
Re‑clicking **Start QR / عرض QR** during an active link threw
`GetQRChannel must be called before connecting` — `StartLink` (`whatsapp.go`) called
`GetQRChannel` after the client was already connected from the first `StartLink`
(whatsmeow requires `GetQRChannel` **before** `Connect`). Doesn't corrupt the first
session but blocks a clean refresh and adds confusion.

---

## Fix (additive; primary fix is Cloud‑side and works with the existing 0.5.0 Bridge)

1. **Persist the real expiry.** New additive column `BridgeTransport.lastQrExpiresAt`
   (both Prisma schemas). Gateway `persistQr` now writes `expiresAt`.
2. **Show a QR only while genuinely live.** `overview.ts` derives freshness from the
   real expiry (fallback ~22s = one rotation, never the old 60s) and exposes
   `qrRemainingMs`. `QrPanel` counts down from the real remaining time. Between
   rotations the panel shows "generating a new code…" instead of a dead QR.
3. **Bridge 0.5.1 (secondary):** `StartLink` cleanly tears down an in‑flight link
   (`Disconnect` → `GetQRChannel` → `Connect`) so re‑click yields a fresh live code
   instead of the error. Added `KEYONE_BRIDGE_LOG_LEVEL=debug` toggle so support can
   ship whatsmeow's full pairing handshake to the Dashboard logs to capture the
   literal server node if a scan still fails (e.g. host clock skew).

**Verification:** Go build/vet/test clean; saas `tsc` = 0; server build against real
Postgres (deploy gate). The customer's existing Bridge already streams the expiry, so
the Cloud‑side fix takes effect on re‑scan with no Bridge update required.
