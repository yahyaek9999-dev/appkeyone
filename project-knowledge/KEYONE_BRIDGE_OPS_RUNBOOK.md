# KEYONE Bridge — Operations Runbook

How to deploy, enable, monitor, and troubleshoot the Bridge in production. The
Bridge is **off by default** (`BRIDGE_ENABLED` unset) and completely inert until
deliberately enabled — existing QR and Meta Cloud customers are never affected.

## Components

| Component | Where | Role |
|---|---|---|
| Cloud bridge APIs | `saas/app/api/bridge/v1/*` | device-code+PKCE link, token rotate, revoke, status |
| `bridge-gateway` | AWS box, systemd `keyone-bridge-gateway` :3002 | WS ingress + relay (localhost-only until Caddy route added) |
| Go Bridge | customer host | headless connector (`keyone-bridge` CLI/service) |

## Deploy the Cloud/gateway

```bash
# from the repo root, on a pushed commit:
deploy/release-aws.sh                 # builds on server, migrates, restarts, verifies
```
Reconciles `~/keyone/DEPLOYED_COMMIT` to the commit and checks `/api/health`.
Never flips feature flags. A failed server build restores the previous `.next`.

## Enable the Bridge in production (go-live checklist)

1. **Wire the public WS route** in the server Caddyfile (`/etc/caddy/Caddyfile`):
   ```
   w.keyone1.com {
     encode gzip zstd
     reverse_proxy /bridge* localhost:3002
     reverse_proxy localhost:3000
   }
   ```
   `sudo systemctl reload caddy`. (Today Caddy sends everything to :3000, so the
   gateway is localhost-only.)
2. **Provision signing certs** and re-release signed installers (see
   `keyone-bridge/packaging/README.md` §4).
3. **Flip the flag**: add `BRIDGE_ENABLED=1` to `~/keyone/.env`, `sudo systemctl
   restart keyone keyone-bridge-gateway`. Also set `BRIDGE_WS_URL=wss://w.keyone1.com/bridge`.
4. **Link one real device** (`keyone-bridge login`), scan the QR from the
   Dashboard, send/receive a test message end to end. Confirm connected memory.
5. Move a pilot tenant's bot to `connectionMode='bridge'` and verify outbound
   routes through the Bridge (the `wa.sendNow` gate) while QR/Meta tenants are
   unchanged.

To **disable**: remove `BRIDGE_ENABLED` from `.env` and restart — everything
returns to 404/inert immediately; no data is lost (bridge rows are additive).

## Customer install (per host)

```bash
# Linux server
sudo keyone-bridge/packaging/install-linux.sh <binary>
sudo -u keyone-bridge KEYONE_BRIDGE_HOME=/var/lib/keyone-bridge KEYONE_BRIDGE_SECRET_FILE=1 keyone-bridge login
sudo systemctl enable --now keyone-bridge
# macOS:   packaging/install-macos.sh   Windows (elevated): packaging/windows/install.ps1
```

## Monitor

- Cloud: `Bridge.status` / `lastHeartbeatAt` per row; the gateway's staleness
  sweep flips stale bridges offline after 90s.
- Gateway health: `curl localhost:3002/health` → `{ok,bridges:N}`.
- Bridge host: `keyone-bridge status`, `keyone-bridge doctor`, `keyone-bridge logs`.

## Troubleshoot

| Symptom | Check |
|---|---|
| Bridge won't link | `keyone-bridge doctor` → API reachable? flag on? Cloud returns 404 ⇒ `BRIDGE_ENABLED` off |
| Bridge shows offline | gateway running? WS route in Caddy? token valid? `doctor` WS line |
| Messages not sending | bot `connectionMode='bridge'`? bridge `status=online`? provider `connected`? offline queue draining? |
| Token rejected after rotation | reuse-detected ⇒ re-link (`keyone-bridge logout` then `login`) |
| Bad update | `keyone-bridge update --rollback`, restart service |

## Rotate / recover

- Token: automatic every 24h; force with `keyone-bridge rotate`.
- Revoke a Bridge from the Cloud: `POST /api/bridge/v1/revoke` (dashboard).
- Rollback a binary: `keyone-bridge update --rollback`.
