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
| Customer Bridge | customer host | Go binary `keyone-bridge`; data dir per OS (see Customer Manual §13) |

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
4. Customer-side: `keyone-bridge logs` / `doctor` on their host shows whatsmeow
   errors (e.g. QR timeout, logged out).

### C. "Messages not sending"
1. Is the bot on Bridge? `Bot.connectionMode` must normalize to `bridge`
   (`lib/messaging/mode.ts`). If it's `qr`/`meta_cloud`, Bridge isn't the path.
2. Is a **primary online** bridge present with WA `connected`? Outbound routes to
   the primary (`pickUserSocket`).
3. Gateway relay: `POST /internal/outbound` → `no_bridge_online` (409) means no
   socket; `ack_timeout` means the bridge didn't ack (WA send failing).
4. Offline queue: outbound during a WA outage is queued on the bridge and drained
   on reconnect — a backlog is expected to clear itself.

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
- The Go bridge is **customer-installed**, not deployed here; it ships as GitHub
  Release binaries/installers (`keyone-bridge/packaging`, `make dist`).

## 9. Escalation

Escalate to engineering with: workspace `userId`, `bridgeId`, the output of §3
(bridge + transports + logs), gateway `journalctl` excerpt (§4), and whether the
public WS route + flag are correctly set (§2). Attach the customer's downloaded
logs if available.

## 10. Known limitations (set expectations)

- WhatsApp only in v1 (the transport interface is kept for future providers).
- `BRIDGE_ENABLED` is global (no per-tenant gate yet).
- Auto-update needs published GitHub Release assets + code-signing before GA;
  until then installers are unsigned (integrity via SHA-256 `checksums.txt`).
- Media/group flows are relayed generically; full media pipeline is post-v1.
