// KEYONE Bridge Gateway — stub Bridge (Phase 2 validation harness).
//
// A minimal, transport-less stand-in for the real Go Bridge (Phase 3). It speaks
// protocol v1 to the gateway so the whole relay can be exercised end to end
// before the Go core exists:
//   • connects with a per-bridge token, sends `hello`, then heartbeats;
//   • can emit an `inbound` message (simulating a customer WhatsApp message) and
//     prints the `outbound` reply the gateway pushes back;
//   • ACKs every `outbound` frame the gateway pushes (simulating a real send);
//   • can emit `state` and `link_artifact` (QR) frames.
//
// It holds NO real WhatsApp anything — it just proves the wire protocol + relay.
//
// Usage:
//   BRIDGE_TOKEN=... node stub-bridge.js [--url ws://127.0.0.1:3002] \
//     [--inbound "hi"] [--from 201000000000] [--state connected] [--qr] [--stay]
//
// Every notable event prints a line beginning with "[stub] " so a test runner
// can assert on stdout.

const WebSocket = require("ws");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function has(name) {
  return process.argv.includes(name);
}

const URL = arg("--url", process.env.GATEWAY_URL || "ws://127.0.0.1:3002");
const TOKEN = process.env.BRIDGE_TOKEN || arg("--token", "");
const INBOUND = arg("--inbound", "");
const FROM = arg("--from", "201000000000");
const STATE = arg("--state", "");
const SEND_QR = has("--qr");
const STAY = has("--stay");

let idc = 0;
const nid = () => `stub-${Date.now()}-${++idc}`;
function frame(type, payload, corr) {
  const f = { v: 1, id: nid(), type, ts: Date.now(), payload: payload || {} };
  if (corr) f.corr = corr;
  return f;
}

const url = TOKEN ? `${URL}?token=${encodeURIComponent(TOKEN)}` : URL;
const ws = new WebSocket(url);

let helloAcked = false;

ws.on("open", () => {
  console.log("[stub] OPEN");
  ws.send(JSON.stringify(frame("hello", { os: "test", arch: "x64", version: "stub-1", capabilities: { whatsapp: true } })));
});

ws.on("message", (raw) => {
  let f;
  try {
    f = JSON.parse(raw.toString());
  } catch {
    console.log("[stub] BADFRAME");
    return;
  }
  console.log(`[stub] RECV ${f.type} ${JSON.stringify(f.payload || {})}`);

  if (f.type === "hello_ack") {
    helloAcked = true;
    console.log("[stub] HELLO_ACK");
    // heartbeat loop
    setInterval(() => ws.send(JSON.stringify(frame("heartbeat", {}))), 25_000).unref?.();
    ws.send(JSON.stringify(frame("heartbeat", {})));

    if (STATE) ws.send(JSON.stringify(frame("state", { provider: "whatsapp", state: STATE, identity: `+${FROM}` })));
    if (SEND_QR)
      ws.send(JSON.stringify(frame("link_artifact", { provider: "whatsapp", kind: "qr", data: "2@FAKEQRSTRING", expiresAt: Date.now() + 20_000 })));
    if (INBOUND)
      ws.send(JSON.stringify(frame("inbound", { provider: "whatsapp", from: { phone: FROM, name: "Stub Customer" }, mediaType: "text", text: INBOUND, providerMessageId: nid(), providerTimestamp: Date.now() })));

    if (!STAY && !INBOUND) {
      // Nothing to wait for — close shortly after the acks.
      setTimeout(() => ws.close(), 500);
    }
  }

  // The gateway pushes replies + async sends as `outbound`. ACK them like a
  // real Bridge that just delivered the message to WhatsApp.
  if (f.type === "outbound") {
    console.log(`[stub] OUTBOUND to=${f.payload?.to} text=${JSON.stringify(f.payload?.text)}`);
    ws.send(JSON.stringify(frame("outbound_ack", { ok: true, providerMessageId: nid() }, f.id)));
    if (!STAY) setTimeout(() => ws.close(), 300);
  }
});

ws.on("close", (code) => {
  console.log(`[stub] CLOSE ${code}`);
  if (!STAY) process.exit(helloAcked ? 0 : 2);
});

ws.on("error", (e) => {
  console.log(`[stub] ERROR ${e.message}`);
});

// Safety timeout so the harness never hangs forever.
setTimeout(() => {
  console.log("[stub] TIMEOUT");
  process.exit(helloAcked ? 0 : 3);
}, STAY ? 3_600_000 : 15_000).unref?.();
