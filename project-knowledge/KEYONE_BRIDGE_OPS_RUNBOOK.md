# KEYONE Bridge — Operations Runbook

> **Superseded 2026-07-12** — this doc described the retired Go/whatsmeow
> Bridge (`keyone-bridge` CLI, install-linux.sh, `BRIDGE_ENABLED` unset by
> default). WhatsApp rejected pairing from reimplemented multi-device clients
> (whatsmeow/Baileys); the transport was replaced with whatsapp-web.js
> (real Chromium), which pairs reliably. **The full, current, actively
> maintained runbook is `KEYONE_BRIDGE_SUPPORT_RUNBOOK.md`** — read that one.
> This file is kept only for the still-accurate deploy/enable steps below.

How to deploy, enable, monitor, and troubleshoot the Bridge in production.
`BRIDGE_ENABLED=1` is **currently set** in production — the Bridge is live,
not gated off. Existing QR and Meta Cloud customers are unaffected either way
(`Bot.connectionMode` scopes the transport per tenant).

## Components

| Component | Where | Role |
|---|---|---|
| Cloud bridge APIs | `saas/app/api/bridge/v1/*` | device-code+PKCE link, token rotate, revoke, status |
| `bridge-gateway` | AWS box, systemd `keyone-bridge-gateway.service` :3002 | WS ingress + relay, public via Caddy `/bridge` |
| Bridge | customer host | `bridge-node/keyone-wa-bridge.js` — Node + whatsapp-web.js + headless Chromium, packaged per-OS (`.pkg`/`.zip`/`.deb`) |

## Deploy the Cloud/gateway

```bash
# from the repo root, on a pushed commit:
deploy/release-aws.sh                 # builds on server, migrates, restarts, verifies
```
Reconciles `~/keyone/DEPLOYED_COMMIT` to the commit and checks `/api/health`.
Never flips feature flags. A failed server build restores the previous `.next`.
See `DEPLOYMENT_RULES.md` for the full contract.

## Publish a new Bridge version (customer-side artifact, separate from the above)

```bash
bash deploy/publish-wwebjs.sh <version>   # bump const VERSION in keyone-wa-bridge.js FIRST
```
See `KEYONE_BRIDGE_SUPPORT_RUNBOOK.md` §8 for the full publish contract and
the VERSION-bump/BOM gotchas.

## Enable/disable the Bridge feature flag

```bash
# enable (already the case in production today):
grep -q '^BRIDGE_ENABLED=' ~/keyone/.env || echo 'BRIDGE_ENABLED=1' | sudo tee -a ~/keyone/.env
grep -q '^BRIDGE_WS_URL=' ~/keyone/.env || echo 'BRIDGE_WS_URL=wss://w.keyone1.com/bridge' | sudo tee -a ~/keyone/.env
sudo systemctl restart keyone.service keyone-bridge-gateway.service

# disable (kill switch — instantly inert, no data loss, bridge rows are additive):
sudo sed -i '/^BRIDGE_ENABLED=/d' ~/keyone/.env
sudo systemctl restart keyone.service
```
Off ⇒ every `/api/bridge/v1/*` route 404s and no Bridge UI renders.

## Customer install (per host) — current, no-Terminal flow

Customers never see any of this — it's automated by the installer:
- **macOS**: download the `.pkg`, double-click, approve. Postinstall runs
  the device-code login in the background, shows the code via a native
  notification, and opens the Dashboard link page pre-filled.
- **Windows**: download the `.zip`, double-click `install.cmd` (no admin, no
  PowerShell typed by hand). Same background auto-link flow, shown via a
  native `MessageBox`.
- **Linux**: `.deb` install + `systemctl enable --now keyone-wa-bridge`;
  linking still requires one manual `keyone-wa-bridge login` (no no-Terminal
  flow built for Linux yet — desktop Linux is a small fraction of the
  customer base).

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
