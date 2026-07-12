# KEYONE Bridge — Internal Support Runbook (Engineers)

Operational reference for diagnosing and resolving KEYONE Bridge issues. Assumes
SSH access to the production box and read access to the Cloud Postgres.
Customer-facing steps live in `KEYONE_BRIDGE_CUSTOMER_MANUAL.md`.

> **Golden rule:** the WhatsApp send pipeline and Meta/QR paths are never touched
> by Bridge. Everything Bridge is additive and gated by `BRIDGE_ENABLED`. If in
> doubt, turning the flag off makes Bridge completely inert with zero customer
> impact.

---

## 1. Topology & where things live

| Piece | Location | Notes |
|---|---|---|
| Cloud app (Next.js) | `~/keyone`, systemd `keyone.service`, `:3000` | Bridge APIs at `/api/bridge/v1/*` |
| Bridge gateway | `~/bridge-gateway`, systemd `keyone-bridge-gateway.service`, `:3002` | WS ingress + relay; localhost-only, exposed via Caddy `/bridge` |
| WhatsApp (legacy QR) | systemd `keyone-wa.service`, `:3001` | Unrelated to Bridge; do not conflate |
| Database | PostgreSQL 16, `127.0.0.1:5432` | Tables `Bridge`, `BridgeTransport`, `BridgeToken`, `BridgeAuthCode`, `BridgeLogLine` |
| Reverse proxy | Caddy, `/etc/caddy/Caddyfile` | `@bridge path /bridge* → :3002`; else `:3000`. Versioned: `deploy/Caddyfile.production` |
| Env | `~/keyone/.env` (also `EnvironmentFile` for the gateway) | `BRIDGE_ENABLED`, `BRIDGE_WS_URL`, `BRIDGE_GATEWAY_INTERNAL_URL`, `BRIDGE_HEARTBEAT_TIMEOUT_MS`, `SAAS_INTERNAL_SECRET`, `POSTGRES_URL` |
| Customer Bridge | customer host | Node/whatsapp-web.js binary `keyone-wa-bridge` (**not** the retired Go/whatsmeow build); data dir per OS (see Customer Manual §13) |

Host: `ubuntu@13.63.79.43` (w.keyone1.com), key `~/Downloads/keyone.pem`.

```bash
# quick health
systemctl is-active keyone keyone-wa keyone-bridge-gateway
curl -s localhost:3002/health         # gateway: {ok,bridges:N}
curl -s https://w.keyone1.com/api/health
```

## 2. Feature flag — enable / disable

`BRIDGE_ENABLED` is **global** (all workspaces), read from `~/keyone/.env`.

```bash
# ENABLE (go-live): also ensure the Caddy /bridge route + BRIDGE_WS_URL are set
sudo sed -i '/^BRIDGE_ENABLED=/d' ~/keyone/.env
echo 'BRIDGE_ENABLED=1' | sudo tee -a ~/keyone/.env
grep -q '^BRIDGE_WS_URL=' ~/keyone/.env || echo 'BRIDGE_WS_URL=wss://w.keyone1.com/bridge' | sudo tee -a ~/keyone/.env
sudo systemctl restart keyone keyone-bridge-gateway

# DISABLE (kill switch — instantly inert, no data loss):
sudo sed -i '/^BRIDGE_ENABLED=/d' ~/keyone/.env
sudo systemctl restart keyone
```

Off ⇒ all `/api/bridge/v1/*` return 404 and no Bridge UI renders. There is **no
per-tenant gate** yet — enabling exposes the Bridge settings page to every
workspace. (Roadmap: per-plan/allowlist gate.)

Caddy `/bridge` route (required for customers to connect):
```bash
sudo cp /path/to/deploy/Caddyfile.production /etc/caddy/Caddyfile   # or edit inline
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
# verify: bad-token WS upgrade must hit the gateway (401), not Next (404)
```

## 3. Inspect a customer's Bridge (DB)

```bash
cd ~/keyone && set -a && . ./.env && set +a; DB="${DATABASE_URL:-$POSTGRES_URL}"; DB="${DB%%\?*}"

# all bridges for a workspace (userId)
psql "$DB" -c "SELECT id,name,status,updating,\"isPrimary\",\"lastHeartbeatAt\",\"lastError\",os,arch,version FROM \"Bridge\" WHERE \"userId\"='<USER_ID>' AND \"revokedAt\" IS NULL;"

# transports (WhatsApp link state + latest QR presence)
psql "$DB" -c "SELECT \"bridgeId\",provider,state,identity,(\"lastQr\" IS NOT NULL) AS has_qr,\"lastQrAt\",\"lastError\" FROM \"BridgeTransport\" WHERE \"bridgeId\" IN (SELECT id FROM \"Bridge\" WHERE \"userId\"='<USER_ID>');"

# recent streamed logs
psql "$DB" -c "SELECT at,level,message FROM \"BridgeLogLine\" WHERE \"bridgeId\"='<BRIDGE_ID>' ORDER BY at DESC LIMIT 50;"

# token ledger (hashes only — never a raw token)
psql "$DB" -c "SELECT id,\"bridgeId\",(\"revokedAt\" IS NULL) AS active,\"lastUsedAt\",(\"prevHash\" IS NOT NULL) AS rotated FROM \"BridgeToken\" WHERE \"bridgeId\"='<BRIDGE_ID>' ORDER BY \"createdAt\";"
```

**Status is derived** (see `lib/bridge/overview.ts::deriveStatus`): `updating` →
Updating; `lastError`/transport `logged_out` → Error; `status<>'online'` →
Offline; online + WA `connected` → Online; online + WA linking/none → Connecting.

## 4. Gateway logs & live tracing

```bash
sudo journalctl -u keyone-bridge-gateway -f            # live
sudo journalctl -u keyone-bridge-gateway --since '-1h' -p err
# gateway logs DB errors, token-verify failures, and connection lifecycle
```

The gateway holds live sockets in memory: `curl -s localhost:3002/health` →
`bridges:N` is the count currently connected. Restarting the gateway drops all
sockets; bridges auto-reconnect within seconds (capped backoff).

## 5. Diagnosis playbooks

### A. "My Bridge shows Offline"
1. `Bridge.status` / `lastHeartbeatAt` in DB — stale (> 90s) ⇒ the gateway's
   staleness sweep marked it offline.
2. Gateway up? `systemctl is-active keyone-bridge-gateway`, `curl localhost:3002/health`.
3. Public WS route works? bad-token `wss://w.keyone1.com/bridge` must return 401
   (reaches gateway). If it 404s, the Caddy `/bridge` route is missing (§2).
4. Otherwise it's the **customer's machine/network** — have them confirm the
   Bridge process is running (`keyone-bridge status`) and online.

### B. "WhatsApp won't connect / no QR"
1. Transport `state` should move `linking → connecting → connected`.
2. QR: `BridgeTransport.lastQr` set and `lastQrAt` fresh (< 60s)? The gateway
   persists QRs from `link_artifact` frames. Stale ⇒ customer must click
   **Start QR** / **Refresh QR** (fires a `start_qr` control frame).
3. Control reaching the bridge? `POST /internal/control` returns `409
   no_bridge_online` if the bridge socket is down.
4. Customer-side: `keyone-wa-bridge logs` / `doctor` on their host. Since v1.0.8
   the bridge self-heals the two known root causes instead of just looping:
   - **Phone shows Linked but Dashboard never leaves "connecting", QR
     regenerates** — whatsapp-web.js loaded a live WhatsApp Web build that had
     drifted past what the page-injection code expects (`ready` never fires
     after `authenticated`). Fixed in v1.0.9 by pinning `webVersionCache` to a
     verified community-tracked build. If it recurs, the fix is bumping
     `WEB_VERSION` in `bridge-node/keyone-wa-bridge.js` to a newer
     `wppconnect-team/wa-version` snapshot and republishing.
   - **QR shown right after a restart discards a session that was about to
     connect** — whatsapp-web.js can emit one spurious `qr` while restoring an
     existing LocalAuth session; the bridge now suppresses it once (60s grace,
     logged as `QR during auth restore — suppressing`) before treating it as
     real. If `ready` never fires within 90s of `authenticated`, the bridge
     auto-clears the session log line `auth watchdog — ... clearing corrupted
     session`).
   - **`Target closed` / `Execution context destroyed` / `already running`** —
     Chromium conflict from a rapid restart; the bridge reaps any orphaned
     Chromium pointing at its own session dir (`reapOrphanChromium`, v1.0.10)
     and retries. A hard-killed daemon (SIGKILL/OOM) self-heals on its next
     `start` for the same reason.

### C. "Messages not sending" (typing shows, customer never gets a reply)
1. Is the bot on Bridge? `Bot.connectionMode` must normalize to `bridge`
   (`lib/messaging/mode.ts`). If it's `qr`/`meta_cloud`, Bridge isn't the path.
2. Is a **primary online** bridge present with WA `connected`? Outbound routes to
   the primary (`pickUserSocket`).
3. Gateway relay: `POST /internal/outbound` → `no_bridge_online` (409) means no
   socket; `ack_timeout` means the bridge didn't ack (WA send failing).
4. Offline queue: outbound during a WA outage is queued on the bridge and drained
   on reconnect — a backlog is expected to clear itself.
5. **Silent safety kill-switch** (confirmed root cause, 2026-07-12): `POST
   /api/whatsapp/incoming` returns `{ok:true, reply:null, blocked:"..."}` on
   several gates — a `2xx` with no error, so the customer sees typing-then-nothing
   and support sees nothing in the gateway logs (the gateway only logs on
   `notifyCloud` failure, not on a successful-but-blocked reply). Check
   `SafetyState.killSwitchActive` for the `userId` first — `reconnect_storm`
   trips at 6+ reconnects in 10 minutes and is a **false positive** if the
   customer was mid-troubleshooting (re-linking repeatedly) rather than actually
   abusive. Self-service: Dashboard → Settings → Safety → "إلغاء الإيقاف
   الطارئ" (calls `POST /api/safety/clear-kill`). Also check `blocked:
   no_subscription / inactive_status / expired / quota_exhausted /
   daily_cap_exhausted` (billing-side, not a bug) and `duplicate_event` (DB
   `@@unique([conversationId, providerMessageId])` de-dupe — expected on a
   gateway retry, not a symptom).

### D. "Update stuck on Updating"
- `Bridge.updating=true` is cleared when the bridge re-says `hello` after the
  swap. If stuck, the update likely failed on the host: check `keyone-bridge
  logs`; have the customer **Restart Bridge**; worst case `keyone-bridge update
  --rollback` on the host restores the prior binary.

### E. "Token reuse detected" / bridge suddenly revoked
- A token presented after rotation trips reuse-detection (`token/rotate` route):
  the **whole bridge is revoked** as a theft defense. Expected after a restore of
  an old backup or a cloned host. Resolution: customer re-links
  (`keyone-bridge logout` then `login` + approve + scan). This is by design.

## 6. Admin actions

```bash
# Force a bridge offline / revoke (unlink) — via the API (auth as the owner) or DB:
psql "$DB" -c "UPDATE \"Bridge\" SET \"revokedAt\"=now(), status='offline' WHERE id='<BRIDGE_ID>';"
psql "$DB" -c "UPDATE \"BridgeToken\" SET \"revokedAt\"=now() WHERE \"bridgeId\"='<BRIDGE_ID>' AND \"revokedAt\" IS NULL;"
# (Preferred: the dashboard 'Unlink device' button / POST /api/bridge/v1/revoke.)

# Clear a stuck 'updating' flag:
psql "$DB" -c "UPDATE \"Bridge\" SET updating=false WHERE id='<BRIDGE_ID>';"

# Trim a noisy log ring is automatic (gateway keeps newest 500/bridge).
```

## 7. Security incident handling

- **Lost/compromised customer host:** unlink the device (revoke) immediately — its
  token stops working at the next WS upgrade. The WhatsApp session never left the
  host, so nothing WhatsApp-secret is in the Cloud to leak.
- **Suspected token leak:** revoke the bridge; the customer re-links. Tokens are
  stored only as `sha256`; rotation + reuse-detection already limit replay.
- **Secrets:** `SAAS_INTERNAL_SECRET` guards the gateway `/internal/*` endpoints
  (localhost only). `AUTH_SECRET` signs dashboard sessions. Rotating either
  requires a coordinated restart — do not rotate casually.
- **What Bridge never stores in the Cloud:** WhatsApp session, cookies, LocalAuth,
  QR image — only hashed tokens, connection state, streamed log lines, and the
  message content the automations already process.

## 8. Deploy & rollback (Cloud/gateway)

```bash
# from a clean checkout on a pushed commit:
deploy/release-aws.sh                 # build-on-server, migrate (additive db push), restart, stamp DEPLOYED_COMMIT, verify
```
- Verifies `~/keyone/DEPLOYED_COMMIT == commit` and `/api/health` ok.
- A failed on-server build restores the previous `.next` and does not restart.
- Schema changes are applied via additive `prisma db push` (fails safe on any
  destructive change).
- Invariant to keep green: **Git == origin/main == DEPLOYED_COMMIT**, and the
  server `saas/` source hashes equal the committed tree.
- The customer Bridge (`bridge-node/keyone-wa-bridge.js`) is **customer-installed**,
  not deployed with the Cloud/gateway above. Publish a new version with
  `deploy/publish-wwebjs.sh <version>` — assembles macOS (arm64+x64 `.pkg`),
  Windows (`.zip`), Linux (amd64+arm64 `.deb`), and the self-update
  `app.tar.gz`, uploads to the KEYONE download store, and writes
  `version.json` + `checksums.txt`. Bump `const VERSION` in
  `keyone-wa-bridge.js` for every publish — a stale VERSION string is what
  caused the v1.0.4 infinite auto-update loop (isNewer() never resolves
  `false`, so the bridge updates-and-restarts itself every ~90s, killing any
  in-progress WhatsApp pairing). Auto-update polls `version.json` and
  self-restarts on a genuinely newer version; checksum verification is
  mandatory since v1.0.9 (a manifest without `sha256` aborts the update).

## 9. Escalation

Escalate to engineering with: workspace `userId`, `bridgeId`, the output of §3
(bridge + transports + logs), gateway `journalctl` excerpt (§4), and whether the
public WS route + flag are correctly set (§2). Attach the customer's downloaded
logs if available.

## 10. Known limitations (set expectations)

- WhatsApp only in v1 (the transport interface is kept for future providers).
- `BRIDGE_ENABLED` is global (no per-tenant gate yet).
- Auto-update fetches from the KEYONE download store (version.json + SHA-256); code-signing of installers remains a pre-GA item;
  until then installers are unsigned (integrity via SHA-256 `checksums.txt`).
- Media/group flows are relayed generically; full media pipeline is post-v1.
- **As of v1.0.10 (2026-07-12):** the QR-restore regression, the WhatsApp Web
  version-drift stall, the orphan-Chromium leak, and the silent kill-switch
  false-positive (§5.C) are fixed and verified with real runtime evidence —
  a throwaway Bridge was linked with a genuine token, the actual published
  binary was run, and the full inbound→AI→outbound round trip was proven
  end-to-end (5.5s). **Not yet verified with a real customer phone scan** —
  no test device was available this session; the fix is reasoned from a
  well-documented whatsapp-web.js failure mode and did not break QR
  generation in the live test, but `ready`/`connected` after an actual scan
  needs field confirmation.
- The Windows installer's PowerShell script must ship with a UTF-8 BOM if it
  contains any non-ASCII character (Arabic text, em-dashes, etc.) —
  `install.cmd` invokes Windows PowerShell 5.1 (`powershell.exe -File`), which
  decodes a BOM-less `.ps1` using the system codepage, not UTF-8, corrupting
  multi-byte sequences inside string literals ("String terminator missing").
  Verify with `xxd install.ps1 | head -1` → must start `efbb bf`.
