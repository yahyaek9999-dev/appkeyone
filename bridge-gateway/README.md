# KEYONE Bridge Gateway (Phase 1 handshake stub)

A tiny standalone Node service that proves the **Bridge ⇄ Cloud WebSocket handshake**
end to end. This is **NOT** the full relay (that is Phase 2). It only:

1. **Authenticates** a connecting Bridge — reads the Bridge token from
   `Authorization: Bearer <token>` **or** `?token=<token>`, computes `sha256(token)`,
   and requires a matching, non-revoked row in the Cloud's `BridgeToken` table
   (and a non-revoked owning `Bridge`). No match → the socket is closed with **4401**.
2. On the first **`hello`** frame → replies **`hello_ack`** and marks the owning
   Bridge online (`Bridge.status='online'`, `lastHeartbeatAt=now()`).
3. On **`heartbeat`** → replies **`heartbeat_ack`** and touches `lastHeartbeatAt`.
4. `GET /health` → `{ "ok": true, "service": "bridge-gateway", "protocol": 1 }`.

It stores **no** WhatsApp auth and never touches the send pipeline. It is fully
additive: nothing runs unless a Bridge deliberately connects to this process.

## Protocol v1 envelope

Matches `keyone-bridge/internal/protocol/envelope.go`:

```json
{ "v": 1, "id": "<frame-id>", "type": "<type>", "ts": 1720000000000, "corr": "<optional>", "ack": true, "payload": { } }
```

Ack frames carry `ack:true` and set `corr` to the request frame's `id`.

## Run

```bash
cd bridge-gateway
npm install                       # installs ws + pg
POSTGRES_URL="postgres://user:pass@host:5432/keyone" \
BRIDGE_GATEWAY_PORT=3002 \
npm start
```

Environment:

| Var                   | Required | Default | Purpose                                                        |
| --------------------- | -------- | ------- | -------------------------------------------------------------- |
| `POSTGRES_URL`        | yes\*    | —       | Cloud Postgres — used to verify `sha256(token)` in `BridgeToken`. `DATABASE_URL` also accepted. |
| `BRIDGE_GATEWAY_PORT` | no       | `3002`  | HTTP+WS listen port.                                           |

\* If `POSTGRES_URL` is unset the gateway **fails closed** — every WS connection is
rejected with 4401. `GET /health` still works.

## Verify the handshake

### 1. Health

```bash
curl -s localhost:3002/health
# {"ok":true,"service":"bridge-gateway","protocol":1}
```

### 2. hello → hello_ack (Node snippet)

Requires a **real** Bridge token whose `sha256` is present as a live
`BridgeToken.tokenHash` in the Cloud DB. Save as `verify.js` and run
`node verify.js <token>` (needs the `ws` dep, e.g. run from inside `bridge-gateway/`):

```js
const WebSocket = require("ws");
const token = process.argv[2];
const ws = new WebSocket("ws://localhost:3002/", {
  headers: { Authorization: `Bearer ${token}` },
});
ws.on("open", () => {
  ws.send(JSON.stringify({ v: 1, id: "h1", type: "hello", ts: Date.now(), payload: {
    protocolVersion: 1, bridgeId: "local", version: "0.1.0", os: "test", providers: ["whatsapp"],
  }}));
});
ws.on("message", (raw) => {
  const f = JSON.parse(raw.toString());
  console.log("recv:", f.type, JSON.stringify(f.payload));
  if (f.type === "hello_ack") {
    // then a heartbeat
    ws.send(JSON.stringify({ v: 1, id: "hb1", type: "heartbeat", ts: Date.now(), payload: {} }));
  }
  if (f.type === "heartbeat_ack") ws.close(1000);
});
ws.on("close", (c) => console.log("closed", c)); // 4401 == bad/missing token
```

Expected output:

```
recv: hello_ack {"ok":true,"ts":...}
recv: heartbeat_ack {"ok":true,"ts":...}
closed 1000
```

A bad or missing token closes immediately with code **4401**.

### 3. wscat (bad token → 4401)

```bash
npx wscat -c "ws://localhost:3002/?token=not-a-real-token"
# Disconnected (code: 4401)
```
