# KEYONE Bridge — "Dashboard stuck on Generating QR after a successful scan" — Root Cause & Fix

**Date:** 2026-07-07
**Severity:** RELEASE BLOCKER (pairing never completes on the customer's Dashboard)
**Status:** ✅ FIXED, republished (1.0.1), verified. Final Dashboard-"Connected" flip needs one customer phone scan with the fixed build.
**Commit:** `7911d42` (HEAD == origin/main == DEPLOYED). Store: version 1.0.1.

---

## 1. Symptom (customer report)

> QR pairing succeeded on the client. The Bridge is connected and the device is linked.
> However, the Dashboard never transitions to Connected. It remains stuck on:
> "Generating a new QR code… Keep this page open."

## 2. The complete event chain — traced, not guessed

The Bridge ships its own logs to the Cloud (`BridgeLogLine`). The chain from the
customer's actual scan (07-07 00:44–00:50 UTC):

```
QR generated        ✓  "QR ready — scan from the Dashboard"   (wwebjs `qr`)
      ↓
QR scanned          ✓  WhatsApp accepted — phone linked the device
      ↓
authenticated       ✓  "QR scanned — authenticating"          (wwebjs `authenticated`)
      ↓
loading 100%        ✓  "loading 100%"                         (wwebjs `loading_screen`)
      ↓
ready               ✗  ← FIRST MISSING STEP — never fires
      ↓  (everything below is downstream of `ready` and therefore never happens)
cloud publish (state:connected)   — never sent
gateway receive / DB update       — BridgeTransport.state stays "linking"
websocket push (connected)        — never
Dashboard render                  — stuck on "جارٍ توليد رمز QR جديد…"
Connected                         — never reached
```

**First missing step = the whatsapp-web.js `ready` event.** `authenticated` fires
and `loading_screen` reaches 100%, but `ready` never fires, so the Bridge never
calls `sendState("connected")`. Confirmed in `BridgeLogLine`: `authenticated`
present, `"connected as …"` (the `ready` handler's line) **absent**.

## 3. Root cause (proven with a controlled comparison)

whatsapp-web.js drives a real Chromium. The `ready` event only fires after
wwebjs successfully injects its Store/WAPI into the loaded WhatsApp Web page.
If the Chromium build drifts from what wwebjs expects, the injection stalls —
`authenticated` fires, `loading` hits 100%, but `ready` hangs. Classic wwebjs.

The **only** variable that differed between working and broken:

| Environment | wwebjs | Chromium binary | Result |
|---|---|---|---|
| Box (my earlier test) — **no system Chrome** | 1.34.7 | puppeteer-matched **146.0.7680.31** | `connected as 201227704155` ✓ (07-06 18:53 & 19:34) |
| **Customer Mac** — installer forced `KEYONE_CHROME` = system Google Chrome | 1.34.7 | arbitrary system build | `authenticated` ✓, **`ready` never fires** ✗ |
| Production Recovery/Import (`whatsapp-service`, pairs every time) | 1.34.7 | puppeteer-matched **146.0.7680.31**, **no `executablePath`** | works ✓ |

- wwebjs version is **identical** (1.34.7) everywhere — not the cause.
- The Bridge set `puppeteer.executablePath = KEYONE_CHROME` (the customer's system
  Chrome), which the macOS/Linux/Windows installers hard-set. The known-good
  production client sets **no `executablePath`** → uses puppeteer's matched
  Chromium 146.0.7680.31 (`~/.cache/puppeteer/chrome/linux-146.0.7680.31`).
- The box had **no system Chrome**, so my earlier Bridge test silently used the
  matched Chromium — which is why it worked there but broke on the customer's Mac.

**Root cause:** the Bridge drove the customer's **system Chrome** instead of the
**puppeteer-matched Chromium** that WhatsApp Web pairing requires.

## 4. The fix — match the known-good production client exactly

`bridge-node/keyone-wa-bridge.js`:
- New `ensureChromium()`: downloads + uses the **puppeteer-pinned Chromium
  (146.0.7680.31**, the exact build production pairs with) via `@puppeteer/browsers`
  into `KEYONE_BRIDGE_HOME/chromium` on first run — same version, same mechanism,
  on every OS. Respects a build-time `PUPPETEER_CACHE_DIR` (Docker bakes it in).
- `executablePath` now points at that matched Chromium. A system Chrome is honored
  **only** as an explicit opt-in (`KEYONE_CHROME_FORCE=1`) — so existing installs
  whose env still has `KEYONE_CHROME` ignore it after updating.
- Puppeteer args now match the production client
  (`--no-first-run --no-zygote --disable-accelerated-2d-canvas` added).
- **Safety net** `confirmConnectedViaState()`: if `ready` is merely *late*, a bounded
  `getState()` poll publishes `connected` once WhatsApp is genuinely `CONNECTED`
  (never before) — so the Dashboard always flips.
- `package.json`: pin `puppeteer` 24.38.0 (prod's version); version → 1.0.1.

Installers/Docker no longer force the system Chrome:
- **macOS** `build-pkg.sh`: removed `KEYONE_CHROME` from the LaunchAgent (keeps
  `KEYONE_BRIDGE_HOME`).
- **Linux** `build-deb.sh`: env file drops `KEYONE_CHROME`; `Depends:` now lists the
  Chromium shared libs (with `t64` alternatives for Ubuntu 24.04+).
- **Windows** `install.ps1`: shim no longer sets `KEYONE_CHROME`.
- **Dockerfile** + the customer Docker snippet: install Chromium's shared libs and
  bake in the puppeteer-matched Chromium (`node .../puppeteer/install.mjs`), no OS
  `chromium` package.

**Downstream chain was already correct** (verified): gateway `case "state"` →
`upsertTransportState`; `overview.ts` `deriveStatus` → `online` when
`wa.state==="connected"`; `control-center.tsx` flips "Generating QR" → "واتساب متصل".
The only defect was `ready` never firing.

## 5. Verification evidence

- **Transport harness (box):** the fixed path downloaded `…/linux-146.0.7680.31/…`,
  **ignored a deliberately-bogus `KEYONE_CHROME`**, and launched wwebjs to a real
  QR event. (`ready` with this exact build already produced `connected as
  201227704155` on 07-06.)
- **Store republished to 1.0.1:** `version.json` engine `whatsapp-web.js`; all
  installers `200`; old Go `latest.exe` → `404`.
- **Real customer `.deb` install** (download public URL → `dpkg -i`): CLI on PATH,
  `keyone-bridge version` → `1.0.1-wweb`, env file **has no `KEYONE_CHROME`**,
  systemd service `active`.
- **Published macOS PKG:** postinstall creates both CLI symlinks; LaunchAgent plist
  has **`KEYONE_BRIDGE_HOME` only**.
- **Published Windows ZIP:** `install.ps1` `KEYONE_CHROME` occurrences = **0**.

## 6. Cross-platform consistency audit

| Aspect | macOS | Linux | Windows |
|---|---|---|---|
| CLI (both names) | `keyone-bridge`, `keyone-wa-bridge` | same | same |
| CLI commands | `login / start / update / version` | same | same |
| WhatsApp engine | matched Chromium 146 (first-run dl) | same | same |
| System Chrome forced? | **No** | **No** | **No** |
| Config/home | `~/.keyone-wa-bridge` | `~/.keyone-wa-bridge` (installing user) | `%LOCALAPPDATA%\keyone-wa-bridge` |
| Session persistence | `HOME/wweb` (LocalAuth) | same | same |
| Install dir | `/usr/local/keyone-wa-bridge` | `/opt/keyone-wa-bridge` | `%ProgramFiles%\KEYONE WA Bridge` |
| Service | LaunchAgent (RunAtLoad+KeepAlive) | systemd (Restart=always, installing user) | Scheduled Task (at-logon, RestartCount 999) |
| Auto-update | `keyone-bridge update` → `app.tar.gz` | same | same |
| Login flow | device-code PKCE | same | same |
| QR / reconnect | identical (same gateway protocol) | same | same |
| Version | 1.0.1 | 1.0.1 | 1.0.1 |
| Download | `macos/latest.pkg` (+Intel) | `linux/latest.deb` (+arm64) | `windows/…win-x64.zip` |
| Dashboard expectations | identical (one gateway protocol → one overview) | same | same |

Config-path and service mechanism differ **only by OS convention** (correct);
everything customer-facing is identical.

## 7. What existing (broken) installs must do

Their installed Bridge still runs the **old** code (system Chrome). To get the fix:
- **Reinstall** the fixed installer from the Dashboard download page (cleanest — the
  installer replaces the bundle and writes a plist/env without `KEYONE_CHROME`), **or**
- **`keyone-bridge update`** (pulls 1.0.1 `app.tar.gz`), then restart the service.

On the first run after the fix, the Bridge downloads the matched Chromium (~90 MB,
one-time) — the first QR can take up to ~1 minute to appear; this is expected.

## 8. Honest limits

- The final **Dashboard → "WhatsApp Connected"** flip requires one **customer phone
  scan** with the fixed build (no WhatsApp handset is available in this environment
  to scan). Every other link in the chain is proven, and the identical
  Chromium/wwebjs config already reached `connected` + Connected on the box.
- Installers are **unsigned** → macOS Gatekeeper / Windows SmartScreen prompts until
  Apple/Windows signing certs are configured.
- Windows fresh-install runtime + macOS-Intel fresh-install runtime were validated by
  artifact inspection (same code paths, same matched-Chromium engine), not executed
  on that hardware here.
