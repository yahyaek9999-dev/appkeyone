# KEYONE Bridge — FINAL RELEASE 2026-07-11 (v1.0.4)

**Release line:** Bridge **v1.0.4-wweb** (store LIVE) · SaaS/gateway `a263960` (DEPLOYED, health ok)
**Trigger:** real customer test failed — bridge *connected* but the platform stayed dead (no inbound, no outbound, no dashboard); Windows installer "terminal opens and immediately closes".

## 1. Root causes found on the REAL customer machine (this Mac)

| # | Evidence | Root cause | Fix |
|---|---|---|---|
| 1 | `bridge.out.log`: `Unexpected server response: 401` every 30s for hours | `connect()`/`scheduleReconnect()` captured the **boot-time token forever**. A re-login supersedes the machine's bridge row and revokes its token → the running daemon 401-loops until manually restarted. Login "worked" (new row) while the daemon stayed dead → Dashboard offline/dead platform. | connect() re-reads `config.json` on EVERY attempt; 401 logs an actionable message + 60s retry → a fresh `login` self-heals within one retry. **Proven live** (revoke → 401 → write new token → reconnected ws#4). |
| 2 | TWO `keyone-wa-bridge.js start` processes: launchd (uid) pid 73120 + **root-owned orphan** pid 40925 (from a sudo start); `bridge.err.log`: `window['onQRChangedEvent'] already exists` | Multiple runtimes on ONE LocalAuth session → WhatsApp force-LOGOUT (the 4×-connected/QR-forever loop). Our own docs said "run `keyone-bridge start`" as a remedy — creating the second runtime. | **Single-instance lock** (`bridge.lock`, pid + 30s mtime heartbeat, stale-safe): extra copies WAIT and take over cleanly. pkg/deb installers now `pkill` orphan runtimes + boot out + delete the **legacy Go bridge** (`com.keyone.bridge` was still RUNNING here) before starting the new daemon. |
| 3 | Installed app = **1.0.2** while store had 1.0.3; Dashboard update button did nothing | `control {action:"update"}` was **not handled** by the runtime (logged "unknown control action"); no periodic update check existed → broken builds could never be fixed remotely. | `update` control now stages the store update + restarts via the service manager; auto-update check 90s after boot + every ~6h (`KEYONE_BRIDGE_NO_AUTOUPDATE=1` opt-out). pkg/deb payloads now **chown'd to the service user** (root-owned files made every in-place update EACCES-fail). |
| 4 | Gateway never told the Cloud about WhatsApp state | The wa-service posts `connected`/`disconnected` events that maintain `Bot.whatsappStatus` + drain the queue on reconnect; the gateway only wrote Bridge* tables → **the entire platform** (Inbox/Recovery/Campaigns gating, status cards) never saw the tenant as connected. | Gateway mirrors the EXACT wa-service events to `/api/whatsapp/incoming` (source:"bridge") on state changes, socket reap, staleness sweep, and shutdown. |
| 5 | Outbound never routed to the bridge | Nothing ever set `Bot.connectionMode='bridge'` (only a hidden settings PUT could) → `maybeRouteBridgeSend` returned null → sends targeted the wa-service (no session there) forever. | `connected(bridge)` **auto-switches** the tenant to `connectionMode='bridge'` (scanning on your machine IS the transport choice). `disconnected(bridge)` only applies to bridge-mode tenants (can't stomp QR/Meta tenants). |
| 6 | `/api/whatsapp/status` polled the wa-service for everyone | For bridge tenants it always said "disconnected" and **stomped** `whatsappStatus` right after the gateway set it. | Bridge-mode branch serves Bridge/BridgeTransport-derived state; `/start` + `/pair` refuse to spawn a competing wa-service session (409 + guidance). |
| 7 | Inbound relay was a stub vs the wa-service | No +E164 (`2012…` vs `+2012…` → split customer identities), **groups/status/newsletters were relayed**, @lid contacts got fake phones (the exact poisoning the wa-service was hardened against), media dropped (`if (!text) return`), no typing indicator, reply delays ignored, `outbound_ack` failures counted as delivered. | Full parity: c.us→`+digits`; trusted-@c.us-only lid resolution; groups/status/newsletter skipped; media base64 (8MB cap) → same transcription/vision pipeline; typing indicator (15s refresh / 90s hard stop); reply carries `replyJid` + `preDelayMs`/`typingDelayMs` and the bridge honors them; cold sends via `getNumberId` (kills "No LID for user"); acks honor `ok:false` + emit `send_failed`. |
| 8 | Windows: "terminal opens and immediately closes" | Download page said "run install.ps1". Double-clicked .ps1 opens Notepad or dies instantly: default execution policy + **unelevated write to %ProgramFiles%** (`$ErrorActionPreference=Stop`). | **install.cmd / uninstall.cmd** wrappers (Bypass policy, window stays open, errors readable) + install.ps1 rewritten **per-user** (`%LOCALAPPDATA%\Programs`, no admin, MOTW unblock, stops bridge-owned node.exe only, retires the old admin install, hidden-window task via wscript, try/catch reporting). Uninstaller no longer kills every node.exe on the machine. |
| 9 | Half-open sockets looked "connected but deaf" | No rx-liveness on the bridge side. | >90s without any gateway frame → recycle the socket. On (re)connect the bridge **re-announces** `connected` if the engine is ready (a gateway restart no longer leaves status stuck). |
| 10 | SIGTERM orphaned Chromium | `process.exit(0)` directly. | Graceful shutdown destroys the Chromium child (time-boxed 4.5s), releases the lock. |
| 11 | `publish-wwebjs.sh` broken from fresh checkout | linux-x64 REF self-copy deletion + wrong remote dist path. | Fixed both; store publish reproducible again. |

## 2. Verification executed (REAL runtime + REAL gateway + REAL saas + REAL DB)

**Local full stack** (disposable PG 16 + built saas + gateway + v1.0.4 runtime with real Chromium):
- tsc 0 errors; **full `next build` green**.
- Runtime: ONE `wa#1`, ONE `ws#N` at a time, single `initialize()`, 0 LOGOUT across the whole session; RSS ~26MB.
- Bridge online + heartbeat + QR persisted with real expiry (DB-asserted).
- **Dashboard control chain live**: `/internal/control start_qr` → WS → runtime acted.
- **Message chain**: state connected → `whatsappStatus=connected`, **`connectionMode` auto-switched qr→bridge**, phone stored; inbound → Customer/Conversation/Message rows (inbox-visible) → reply pushed with humanize delays (typingDelayMs 9799) + correct jid; peer close → reap → `disconnected` (mode-guarded).
- **Send pipeline (untouched code)**: WaMessage queued → `cron/outgoing-messages` drain → transport-router → gateway `/internal/outbound` → bridge frame → ack → row `sent`. 
- **Lock**: second `start` waited ("another keyone-wa-bridge (pid …) already runs") — no second Client.
- **401 self-heal**: token rotated in DB → gateway bounce → 401 + actionable log + 60s retry → new token written to config.json → reconnected next attempt.
- **Soak**: no duplicate events, no logout, no reconnect loops, stable heartbeat; graceful SIGTERM leaves 0 orphan Chromium.

**Production** (after deploy `a263960` + store 1.0.4):
- `/api/health` ok/db ok; gateway healthy; all services active.
- **Public-route protocol chain** (isolated `e2e-internal` tenant, wss://w.keyone1.com/bridge): hello→state connected→inbound→reply(+delays) in ~180ms; prod DB assertions: `connected|bridge|201555000111`, message rows persisted; peer close → `disconnected`. Test tenant removed afterwards.
- Store: `version.json` **1.0.4**, all installers 200, checksums verified server-side, `app.tar.gz` contains the 1.0.4 runtime (auto-update path for existing installs).
- This Mac set up exactly as a customer (fresh device-code login + LaunchAgent on v1.0.4): bridge **online** on prod, QR streaming to the Dashboard — final scan is the one physical step only a phone can do.

## 3. Customer-facing state
- New installs (all OS) get v1.0.4 from the store; Windows flow is now double-click `install.cmd`.
- Existing 1.0.2/1.0.3 installs: **cannot receive the fix remotely** (their builds ignore the update control and have no auto-check). One manual `keyone-bridge update` or a reinstall converges them; from 1.0.4 onward updates are automatic.
- Both WhatsApp sessions on the test machine were already logged out by the pre-fix LOGOUT loop → one fresh QR scan re-links (expected, one-time).

## 4. Gotchas recorded
- macOS launchd list showed the legacy `com.keyone.bridge` (Go) STILL running weeks after replacement — always retire old services in installers.
- A root-owned bridge (from `sudo keyone-bridge start`) survives user-level cleanup; installers pkill as root.
- `df` on macOS sealed-system: check `/System/Volumes/Data`. The 5-arch store build needs ~1.2GB free locally — the box-split scripts (`deploy/wwebjs/`) avoid that.
- `lib/db` prefers `DATABASE_URL` over the postgres schema's `POSTGRES_URL` — local builds need BOTH pointed at PG.
- Build-time static export needs a REACHABLE PG (3 auth pages prerender DB queries) + a `SiteConfig` singleton row (concurrent upsert race on empty DB).
