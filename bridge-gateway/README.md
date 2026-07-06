# KEYONE Bridge Gateway (Phase 2 relay)

A small standalone Node service that carries a customer-hosted **Bridge**'s
transport traffic to/from the Cloud over a versioned WebSocket (protocol v1). It
holds **no** WhatsApp auth and **never** touches the send-pipeline code — it is
pure relay + auth. Everything only runs when a Bridge deliberately connects and a
bridge-mode tenant deliberately routes through it (both gated by `BRIDGE_ENABLED`
on the Cloud side).

## What it does

| Area | Behavior |
| --- | --- |
| **Auth** | Reads the Bridge token from `Authorization: Bearer <token>` **or** `?token=<token>`, computes `sha256(token)`, requires a matching non-revoked `BridgeToken` + non-revoked owning `Bridge`. Verified at **WS-upgrade time** (`verifyClient`) so the first frame can't race the listener. Bad/missing token → the upgrade is rejected with **HTTP 401**. |
| **hello** | Marks the owning Bridge online (`status='online'`, `lastHeartbeatAt=now()`); replies `hello_ack`. |
| **heartbeat** | Touches `lastHeartbeatAt`; replies `heartbeat_ack`. Plus a 30s ws ping keepalive terminates dead sockets. |
| **inbound** (bridge→cloud) | Relayed **1:1** to the same endpoint the whatsapp-web.js gateway uses — `POST {CLOUD_INCOMING_URL}` with `x-internal-secret`, body `{event:"incoming",userId,from,mediaType,text,mediaBase64,mimetype,providerMessageId,providerTimestamp}`. The synchronous `{reply}` is pushed straight back to the Bridge as an `outbound` frame (mirrors the wa-service). Acked with `inbound_ack`. |
| **outbound** (cloud→bridge) | `POST /internal/outbound` (localhost, `x-internal-secret`) → pushes an `outbound` frame to the tenant's **primary online** Bridge and waits for `outbound_ack`/`outbound_nack` (30s). 401 without the secret, 409 `no_bridge_online` if nothing is connected. |
| **state** (bridge→cloud) | Upserts the `BridgeTransport` row (`state`, `identity`); replies `state_ack`. |
| **link_artifact** (bridge→cloud) | Stashes the latest QR/link string per bridge in memory; readable at `GET /internal/qr?bridgeId=` (secret). Replies `link_artifact_ack`. Real QR generation is Phase 3 (the Go core). |
| **offline** | Socket close flips the Bridge offline immediately; a 60s DB sweep covers crash-without-close (staleness > `BRIDGE_HEARTBEAT_TIMEOUT_MS`). |
| **health** | `GET /health` → `{ ok, service, protocol, bridges }`. |

## Protocol v1 envelope

```json
{ "v": 1, "id": "<frame-id>", "type": "<type>", "ts": 1720000000000, "corr": "<optional>", "ack": true, "payload": { } }
```

Ack frames set `corr` to the request frame's `id`. Frame types: `hello`/`hello_ack`,
`heartbeat`/`heartbeat_ack`, `inbound`/`inbound_ack`, `outbound`/`outbound_ack`/`outbound_nack`,
`state`/`state_ack`, `link_artifact`/`link_artifact_ack`, `error`.

## Environment

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `POSTGRES_URL` | yes\* | — | Cloud Postgres — token verify + status/transport writes. `DATABASE_URL` also accepted. |
| `SAAS_INTERNAL_SECRET` | yes\* | — | Shared secret for inbound relay + `/internal/*`. Fails closed if unset. |
| `CLOUD_INCOMING_URL` | no | `http://127.0.0.1:3000/api/whatsapp/incoming` | Where inbound is relayed. |
| `BRIDGE_GATEWAY_PORT` | no | `3002` | HTTP + WS listen port. |
| `BRIDGE_HEARTBEAT_TIMEOUT_MS` | no | `90000` | Offline staleness threshold for the sweep. |
| `BRIDGE_OUTBOUND_ACK_TIMEOUT_MS` | no | `30000` | How long to await an `outbound_ack`. |

\* Fails **closed**: no `POSTGRES_URL` ⇒ every WS connection rejected; no
`SAAS_INTERNAL_SECRET` ⇒ inbound relay and `/internal/*` rejected. `GET /health`
always works.

## Deployment note (Phase-2 go-live)

The gateway is **localhost-only** today. To expose it, add a Caddy route that
reverse-proxies the WS path to it (path is preserved), e.g.:

```
w.keyone1.com {
  reverse_proxy /bridge* localhost:3002
  reverse_proxy localhost:3000
}
```

The gateway intentionally imposes **no WS path restriction** (auth is by token,
not path), so it works whether Caddy preserves or strips `/bridge`.

## Run + validate

```bash
cd bridge-gateway
npm install                      # ws + pg

# run
POSTGRES_URL=... SAAS_INTERNAL_SECRET=... BRIDGE_GATEWAY_PORT=3002 npm start

# drive a stub Bridge (no Go core needed) against a running gateway:
BRIDGE_TOKEN=<real-token> node stub-bridge.js --url ws://127.0.0.1:3002 \
  --inbound "hello" --from 201000000000 --state connected --qr
```

`stub-bridge.js` is a transport-less stand-in for the real Go Bridge: it speaks
protocol v1, emits inbound/state/link frames, and ACKs outbound pushes — enough
to exercise the entire relay before Phase 3 exists.
