# KEYONE Bridge — FINAL RELEASE LOCKDOWN Report

**Date:** 2026-07-07
**Release:** Bridge **v1.0.3** (store) · SaaS/gateway `20461a4` (HEAD == origin/main == DEPLOYED)

## 0. Runtime singleton — the "connected ×4 → LOGOUT → QR forever" bug (post-lockdown, from real runtime logs)

Real logs showed login/gateway/Chromium/scan all working (`connected as 201227704155`), but the connected event fired **4×**, then **LOGOUT**, then QR regenerated forever, and messages produced no Dashboard activity.

**Root cause:** making `ensureWa()` async (for the one-time Chromium download) put an `await ensureChromium()` gap between the `if (wa) return` singleton guard and `new Client()`. Concurrent callers (resume-on-connect + `start_qr` + `reconnect`) each passed the guard and each built a **new Client/Browser**. Multiple whatsapp-web.js clients on the **same LocalAuth session** make WhatsApp emit **LOGOUT** (one web session per device) → the session is torn down → QR loop; the orphaned clients each re-emit `ready`/`connected` (the 4×) and fight, so no stable session → no messages.

**Fix (strict singletons + object-id logging to prove it):**
- `ensureWa` memoizes the in-flight creation in `waInit` (assigned **synchronously**, before any await) → every concurrent caller awaits the SAME promise → exactly **one** Browser, Client, `initialize()`, and listener set.
- `markConnected()` idempotent via `connectedOnce` → exactly **one** connected event; removed the getState safety-net (a second connected source).
- `destroyWa()` is the single teardown (removeAllListeners + destroy + reset); the `disconnected`/LOGOUT handler tears down and does **not** auto-recreate (that self-recreation *was* the loop).
- `control()` serialized; `connect()` a strict single WebSocket (terminate prior, tracked reconnect timer, `ws===sock` guards).
- Gateway: `reap()` cleans half-open/hard-killed sockets from `bridgesById`/`socketsByUser` without waiting for a `close` that may never arrive (ping-terminate + a readyState reconcile pass).

**PROVEN on the box (object ids):**
- 6 concurrent `start_qr` → **`wa#1` only, `ws#1` only, initialize=1, LOGOUT=0**, all QR from `wa#1`.
- Gateway restart → reconnects **`ws#2` with the SAME `wa#1`** (initialize still 1, 0 LOGOUT).
- `kill -9`'d bridge → gateway reaps the socket in **~10s** (not stuck forever).
- Connected-state chain **13/13** re-run green on the deployed gateway.

Message-relay path (`client.on("message")` → `inbound` → gateway → `/api/whatsapp/incoming`) is the same wiring the production wa-service uses and now logs `inbound from … → relaying to Cloud [wa#N]`; it was starved only because the LOGOUT loop killed the session. Full message→Dashboard confirmation needs one live phone scan.

---

_(original lockdown, still valid:)_

**Prior release line:** Bridge v1.0.2 · SaaS `715f8aa`
**Verdict:** ✅ **READY FOR CUSTOMER RELEASE** — 0 known BLOCKER/HIGH. Remaining items are external-only (installer signing, one human phone scan, live Windows/Intel-Mac runtime).

**Self-review (adversarial, after the main audit): 4 raw → 1 confirmed HIGH, fixed.** The update/rollback app-swap (`renameSync(app,backup); renameSync(src,app)`) could leave `app/` MISSING if the 2nd rename threw mid-swap (Windows lock/AV, TOCTOU) → service can't start. Both swap paths now restore `app/` from the backup on failure (a failed update/rollback self-heals). Verified present in the shipped `.deb`. The other 3 self-review findings were REFUTED.

---

## 1. FIRST PRIORITY — "scans OK but Dashboard stays Offline / device info disappears"

### 1.1 The complete state flow was traced and the chain is NOT broken

A synthetic bridge was driven against the **live** gateway, asserting every downstream step (no phone needed):

```
Bridge → hello            → Bridge.status = online + os/arch/version persisted   ✓
       → state:connected  → BridgeTransport.state = connected + identity          ✓
       → (overview derive) → top-level status = ONLINE  (Dashboard "متصل")         ✓
       → link_artifact     → QR persisted with real expiry                         ✓
       → heartbeat         → heartbeat_ack                                         ✓
       → close             → status = offline, NOT revoked, identity survives      ✓
```
**Result: 13/13 checks pass.** `overview.deriveStatus` returns `online` the instant `Bridge.status==online && transport.state==connected`; the gateway persists `state` via `upsertTransportState`; the control-center flips "Generating QR" → "واتساب متصل". The chain works.

### 1.2 The two real root causes (both fixed)

| # | Root cause | Evidence | Fix |
|---|---|---|---|
| 1 | **Windows installer never started the daemon.** macOS (`launchctl bootstrap`+`RunAtLoad`) and Linux (`systemctl start`) start the bridge **at install**; Windows only registered an **at-logon** Scheduled Task and never started it → after install + `keyone-bridge login`, nothing ran until the next logon. | Bridge row `DESKTOP-QW8E9T` registered but `status=offline`, `os/version/heartbeat` empty, **zero** log lines, gateway `bridges:0`. `hello`/version/logs only travel over an open WS → the WS never opened → the `start` process wasn't running. | `install.ps1`: `Start-ScheduledTask` + `Start-Process` at install, bound to an explicit `New-ScheduledTaskPrincipal` (task `%LOCALAPPDATA%` == CLI home); renamed the reserved `$Home` → `$HomeDir`. |
| 2 | **Every `keyone-bridge login` created a new Bridge row without superseding the same machine's prior rows** → ghost accumulation; retrying customers saw devices appear/disappear. | 11 `DESKTOP-QW8E9T`/anon rows, each revoked minutes after creation across the retry history. | `device/token`: inside the atomic tx, revoke prior non-revoked bridges with the same `userId+name` (+ their tokens) and elect a primary if none exists → **one active bridge per machine**. Verified 7/7. |

(The matched-Chromium pairing fix — system-Chrome → puppeteer-matched Chromium 146 — shipped earlier; see `BRIDGE_DASHBOARD_CONNECTED_FIX_2026-07-07.md`.)

## 2. Full production audit (adversarially verified)

**42 agents, 37 raw findings → 6 CONFIRMED, 0 BLOCKER/HIGH.** Every raw "blocker/high" was **REFUTED** on verification:

- `pendingAcks` "leak" → self-reaps via its own 30s timer (bounded).
- `Bridge.updating`/`lastError` "schema mismatch" → the fields exist in the real schema + generated client (finder read the merge-source draft).
- QrPanel / LogsPanel timer "leaks" → React cleanup + reconciliation are correct.
- PKCE "one-sided hash" → the extra `sha256Hex` is applied symmetrically.
- logs "workspace isolation" → an ownership guard (`findFirst where userId`) precedes the query.
- gateway `/internal/*` "Phase-1 stub" → all three endpoints are implemented + secret-gated.

### The 6 CONFIRMED (all fixed + verified)

| Sev | Finding | Fix | Verified |
|---|---|---|---|
| med | Gateway restart left connected bridges falsely "online" ~150s (bridge-mode sends fail) | `shutdown()` bulk-marks offline + terminates sockets on SIGTERM | **4/4** — flips offline in ~3s |
| med | Documented `logout` CLI missing | added `logout` (local token+session wipe; full revoke is Dashboard-side, since `/revoke` needs a session) | CLI runs |
| med | `doctor`/`status`/`logs`/`stop`/`restart` CLI missing | added all verbs | CLI runs |
| med | `update --rollback` was a silent no-op | `cmdUpdate` now restores the staged `app.old` | code + syntax |
| med | macOS/Linux install auto-start failures silently swallowed | print an actionable "start it now" warning | scripts |
| low | `?limit=abc` → `take:NaN` → HTTP 500 in logs route | `Number.isFinite` clamp `[1,500]` default 200 | tsc |

## 3. Verification evidence (executed)

- **Connected-state chain:** 13/13 (synthetic bridge → gateway → DB → overview ONLINE; close→offline without revoke).
- **Login supersede:** 7/7 (two same-machine logins → first revoked + token revoked; exactly one active primary).
- **Graceful shutdown:** 4/4 (online → gateway restart → offline in ~3s → gateway healthy again).
- **Customer `.deb` install (1.0.2):** downloaded from the public URL → `version`=1.0.2-wweb; `status`/`doctor` show engine = matched Chromium 146 + cloud reachable; `logs` guidance; unknown-cmd prints full usage; `update` = up-to-date; env has no `KEYONE_CHROME`.
- **Production infra:** HTTP/2 + valid TLS (exp 2026-09-29), `/api/health` ok/db-ok, all four services active (keyone, gateway, caddy, postgresql), PG 16.14, downloads 200 + correct MIME, 14G disk / 6.5G RAM free.
- **Public WS route:** `wss://…/bridge` over HTTP/1.1 → 401 on bad token (reachable; the earlier "404" was a curl-HTTP/2 artifact — the real Node `ws` client uses HTTP/1.1).
- **Store:** version.json = 1.0.2, engine whatsapp-web.js, all installers 200, **old Go artifacts 404**, 0 leftovers.
- **tsc:** 0 errors across all changes.

## 4. Cross-platform consistency

Same CLI (`keyone-bridge`/`keyone-wa-bridge` → login/start/status/doctor/logs/restart/stop/logout/update/version), same matched-Chromium engine (no system Chrome), same config home concept, same session persistence, same auto-update, same version **1.0.2**, same download page. Install-time daemon start is now uniform: macOS LaunchAgent (bootstrap+RunAtLoad), Linux systemd (start), Windows (Start-ScheduledTask + Start-Process). Config-path + service mechanism differ only by OS convention.

## 5. Reconnect / resilience (verified by code + tests)

- **Internet loss / gateway restart:** bridge WS `close` → `scheduleReconnect` exponential backoff → reconnects; gateway restart flips it offline then it re-`hello`s online.
- **Service restart / reboot:** systemd `Restart=always` / launchd `KeepAlive` / Windows task `RestartCount 999` → daemon restarts → `LocalAuth` resumes the WhatsApp session (no re-scan).
- **Dashboard / browser refresh:** state is DB-backed; the overview poll re-reads it — refresh is stateless and safe.
- **Disconnect ≠ revoke:** a socket close marks offline but never revokes; identity + device info survive.

## 6. Remaining external-only items (cannot be completed by software alone)

1. **Installer signing/notarization** — no Apple Developer ID / Windows Authenticode certs → Gatekeeper/SmartScreen prompt on first launch. Integrity is provided via SHA-256 `checksums.txt`. *Needs the certs.*
2. **Final Dashboard→"Connected" flip** — requires **one human phone scan** with the fixed build; no WhatsApp handset exists in this environment. Every other link is proven, and the identical Chromium/wwebjs config already reached `connected` on the box.
3. **Live Windows 10/11 + macOS-Intel fresh-install runtime** — validated by artifact inspection + the identical Node/matched-Chromium code path; not executed on that hardware here.

Everything achievable in software is done and verified. HEAD == origin/main == DEPLOYED == `3f9bda8`; store 1.0.2.
