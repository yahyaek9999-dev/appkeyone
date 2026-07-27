# Incident Report: Dead Puppeteer Binding — Inbound WhatsApp Silent Drop
**Date:** 2026-07-27  
**Severity:** P1 — All inbound WhatsApp messages silently dropped  
**Duration:** ~3h (13:11–16:27 UTC ENOTFOUND + binding death; fixed 17:38 UTC with permanent patch)  
**Component:** `keyone-wa-bridge` / `whatsapp-web.js` Puppeteer binding  
**Status:** RESOLVED — permanent fix deployed, E2E verified

---

## Summary

After a 3-hour DNS ENOTFOUND outage (bridge could not resolve `w.keyone1.com`), the bridge reconnected at 16:27 UTC but all inbound WhatsApp messages were silently dropped. The bot number received messages visible in the Chromium WA Web UI, but no `message` events fired in Node.js. The cause was a dead Puppeteer `Runtime.addBinding` in `whatsapp-web.js` v1.34.7's `exposeFunctionIfAbsent` function. A permanent upsert fix was applied to the bridge's `Puppeteer.js` module and the full 8-stage inbound pipeline was verified end-to-end.

---

## Root Cause

### Trigger
DNS ENOTFOUND outage from ~13:11 to 16:27 UTC prevented the bridge from reaching the gateway. After DNS recovered, the bridge reconnected, WA Web synced missed messages, and the SPA context was reset.

### Mechanism — `exposeFunctionIfAbsent` bug in wweb v1.34.7

**File:** `/usr/local/keyone-wa-bridge/app/node_modules/whatsapp-web.js/src/util/Puppeteer.js`

**Old (buggy) code:**
```javascript
async function exposeFunctionIfAbsent(page, name, fn) {
    const exist = await page.evaluate((name) => !!window[name], name);
    if (exist) {
        return;  // BUG: skips re-registration when window[name] exists
    }
    await page.exposeFunction(name, fn);
}
```

**Sequence of failure:**
1. Bridge restarts / session restores → `evaluateOnNewDocument` re-runs → `window.onAddMessageEvent` is defined in browser
2. `attachEventListeners(reinject=true)` calls `exposeFunctionIfAbsent`
3. `exposeFunctionIfAbsent` sees `window.onAddMessageEvent` exists → skips `page.exposeFunction`
4. No new `Runtime.addBinding` is registered in the current CDPSession
5. When WA Web calls `window.onAddMessageEvent(msg)`, Chrome fires `Runtime.bindingCalled` to the old, dead CDPSession — Node.js never receives it
6. All inbound messages are silently dropped (no log, no error)

### Why It Survived a Restart
Puppeteer's `exposeFunction` uses `evaluateOnNewDocument` to persist the `window[name]` function across page navigations. After a bridge restart that reuses the same browser session, `window.onAddMessageEvent` is already defined when `attachEventListeners` runs, so `exposeFunctionIfAbsent` skips registration every time.

---

## Diagnosis Path

### Step 1: Confirm WA Web receives messages
Browser title showed `(1) WhatsApp Business` unread count — messages reaching Chromium UI.

### Step 2: Confirm Puppeteer bindings exist
Via Chrome DevTools Protocol on port 49734:
```javascript
Runtime.evaluate({ expression: "typeof window.onAddMessageEvent" })
// → "function" ✓

Runtime.evaluate({ expression: "typeof window.puppeteer_onAddMessageEvent" })
// → "function" ✓
```

### Step 3: Confirm binding is dead
Registered `Runtime.addBinding({name: "puppeteer_onAddMessageEvent"})` in a fresh CDP session. When `window.onAddMessageEvent({...})` was called, the fresh session received `Runtime.bindingCalled` — but Puppeteer's Node.js handler never fired. Confirmed dead binding.

### Step 4: Temporary fix via CDP
Cleared all stale window bindings (`window.onAddMessageEvent = undefined` etc.) → triggered `Page.reload` → `exposeFunctionIfAbsent` saw undefined → called `page.exposeFunction` → fresh `Runtime.addBinding` registered. Proved by first inbound relay: `17:17:08 inbound from +test (text) → relaying to Cloud`.

---

## Permanent Fix

**File:** `/usr/local/keyone-wa-bridge/app/node_modules/whatsapp-web.js/src/util/Puppeteer.js`

```javascript
async function exposeFunctionIfAbsent(page, name, fn) {
    const exist = await page.evaluate((name) => !!window[name], name);
    if (!exist) {
        await page.exposeFunction(name, fn);
        return;
    }
    // Window function exists — remove and re-register to ensure the Puppeteer
    // CDPSession has a live Runtime.addBinding for the current execution context.
    try { await page.removeExposedFunction(name); } catch (_) {}
    try { await page.exposeFunction(name, fn); } catch (_) {}
}
```

**Mechanism:** Upsert pattern — always removes then re-registers when `window[name]` already exists, ensuring `Runtime.addBinding` is always fresh on the active CDPSession.

**Requires:** `page.removeExposedFunction` (available since Puppeteer 20.6 / puppeteer-core ≥20.6).

**Bridge restart:** `launchctl stop keyone-wa-bridge && launchctl start keyone-wa-bridge` → new PID 13638.

---

## E2E Verification

After permanent fix deployment:

| UTC | Bridge Log | DB Row |
|-----|-----------|--------|
| 17:37:15 | `inbound from +201097767079 (text) → relaying to Cloud` | `user` message `cms3ierd4004nhxfhc2p7lear` at 17:37:15.784 |
| 17:38:26 | `inbound from +447710173736 (text) → relaying to Cloud` | `user` message at 17:38:26.556 |
| 17:40:33–17:48:08 | 7 more messages relayed | Full 16-message conversation in DB |

Bot `whatsappStatus` = `connected`, `connectionMode` = `bridge`. Subscription active (expires 2028-07-01). AI replies confirmed (`assistant` rows at correct latency ~10-15s).

**All 8 stages verified:**
1. WA Web fires `message` event ✓
2. Bridge `relayInboundMsg` sends `inbound` frame via WebSocket ✓
3. Gateway receives frame, sends `inbound_ack`, calls `relayInbound` ✓
4. Gateway POSTs to `http://127.0.0.1:3000/api/whatsapp/incoming` via Caddy ✓
5. SAAS auth (`x-internal-secret`) passes ✓
6. Message row inserted in `Message` table ✓
7. AI reply generated and persisted ✓
8. Reply pushed back via `outbound` frame → bridge → WA send ✓

---

## Contributing Factors

### Previous Incident: ENOTFOUND Outage
- Bridge DNS resolution for `w.keyone1.com` failed from ~13:11 to 16:27 UTC (3+ hours)
- Root cause of outage not fully determined (DNS cache expiry + network blip suspected)
- During outage, WA session remained authenticated but missed messages accumulated

### Session Sync After Reconnect
- whatsapp-web.js syncs missed messages on reconnect, which triggers SPA context reset
- Context reset invalidates all CDPSession registrations but NOT `evaluateOnNewDocument` window functions
- This is the exact trigger for the dead-binding bug

---

## Recurrence Risk

| Risk | Mitigation |
|------|-----------|
| Next DNS outage causes same binding death | Permanent fix prevents recurrence — upsert always re-registers |
| wweb package update overwrites the patch | Bridge update procedure must reapply the patch OR submit upstream PR |
| Future `whatsapp-web.js` versions fix this natively | Monitor upstream issues; patch is additive and safe |

### Package Update Risk
The fix is applied to `node_modules` directly. A `npm update` or bridge reinstall will lose it. Recommended: add a post-install script or submit PR to wweb upstream.

---

## Actions Required

- [ ] Submit PR to whatsapp-web.js upstream with the upsert fix (or open issue #`exposeFunctionIfAbsent` dead binding after SPA context reset)
- [ ] Add bridge update procedure: after `npm update`, verify `Puppeteer.js` still has the upsert fix
- [ ] Investigate root cause of ENOTFOUND outage (DNS TTL? Network blip? VPN?)
- [ ] Add monitoring: bridge heartbeat gap > 60s → alert

---

## Timeline

| UTC | Event |
|-----|-------|
| ~13:11 | Bridge starts logging `ENOTFOUND w.keyone1.com` |
| 13:11–16:27 | Bridge WebSocket down; WA session alive but messages missed |
| 16:27 | DNS resolves; bridge reconnects (`cloud link up [ws#60]`) |
| 16:40 | Old bridge shutdown for investigation |
| 16:40:21 | Bridge restart (`cloud link up [ws#1]`); WA reconnects; `message` event dead |
| ~16:45 | CDP diagnostic confirms dead `Runtime.addBinding` |
| 17:17:08 | Temporary fix via CDP proves binding can be restored; `+test` relayed |
| 17:37:15 | First real inbound message relayed (+201097767079) |
| 17:38:43 | Old bridge shutdown; patched bridge (PID 13638) starts |
| 17:38:46 | Patched bridge: `cloud link up [ws#1]` |
| 17:38:56 | Patched bridge: `connected as 201227704155` |
| 17:40:33 | Patched bridge relays real message; DB confirms insert |
| 17:48:08 | Full 16-message conversation in DB; E2E verified |
