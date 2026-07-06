// KEYONE Bridge Gateway — Phase 1 handshake stub.
//
// A tiny standalone WS ingress that proves the Bridge⇄Cloud handshake end to end.
// It is NOT the full relay (Phase 2). It only:
//   1. authenticates a connecting Bridge by its token (sha256(token) must match a
//      live, non-revoked BridgeToken row in the Cloud Postgres);
//   2. answers the protocol v1 `hello` frame with `hello_ack` and marks the
//      owning Bridge online (Bridge.status='online', lastHeartbeatAt=now);
//   3. answers `heartbeat` with `heartbeat_ack`.
//
// It stores NO WhatsApp auth and never touches the send pipeline. Everything here
// is additive and only runs when a Bridge deliberately connects to this process.
//
// Protocol v1 envelope (matches keyone-bridge/internal/protocol/envelope.go):
//   { v:1, id, type, ts, corr?, ack?, payload? }
//
// Env:
//   POSTGRES_URL          Cloud Postgres connection string (required for token verify)
//   BRIDGE_GATEWAY_PORT   listen port (default 3002)

const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const PROTOCOL = 1;
const PORT = Number(process.env.BRIDGE_GATEWAY_PORT || 3002);
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";

// A single shared pool. If no URL is configured, token verification always fails
// closed (safer than accepting unverified Bridges).
const pool = POSTGRES_URL
  ? new Pool({ connectionString: POSTGRES_URL, max: 4 })
  : null;

if (!pool) {
  console.warn(
    "[bridge-gateway] POSTGRES_URL not set — every connection will be rejected (fail-closed)."
  );
}

/** sha256 hex — the exact hash the Cloud stores in BridgeToken.tokenHash. */
function sha256(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** Extract the Bridge token from the Authorization: Bearer header or ?token=. */
function extractToken(req) {
  const auth = req.headers["authorization"] || req.headers["Authorization"];
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  try {
    const url = new URL(req.url, "http://localhost");
    const q = url.searchParams.get("token");
    if (q) return q.trim();
  } catch {
    /* ignore malformed url */
  }
  return null;
}

/**
 * Verify a Bridge token against the Cloud. Returns the owning bridgeId on success,
 * or null on any failure. Fails closed on missing config / db error.
 */
async function verifyToken(token) {
  if (!token || !pool) return null;
  const tokenHash = sha256(token);
  try {
    const { rows } = await pool.query(
      `SELECT "bridgeId"
         FROM "BridgeToken"
        WHERE "tokenHash" = $1
          AND "revokedAt" IS NULL
        LIMIT 1`,
      [tokenHash]
    );
    if (rows.length === 0) return null;
    const bridgeId = rows[0].bridgeId;

    // Make sure the owning Bridge itself is not revoked.
    const bridge = await pool.query(
      `SELECT "id" FROM "Bridge" WHERE "id" = $1 AND "revokedAt" IS NULL LIMIT 1`,
      [bridgeId]
    );
    if (bridge.rows.length === 0) return null;

    // Best-effort touch — never fatal.
    pool
      .query(`UPDATE "BridgeToken" SET "lastUsedAt" = now() WHERE "tokenHash" = $1`, [
        tokenHash,
      ])
      .catch(() => {});

    return bridgeId;
  } catch (err) {
    console.error("[bridge-gateway] token verify db error:", err.message);
    return null;
  }
}

/** Mark a Bridge online (status + heartbeat). Best-effort, never throws. */
async function markOnline(bridgeId) {
  if (!pool || !bridgeId) return;
  try {
    await pool.query(
      `UPDATE "Bridge"
          SET "status" = 'online', "lastHeartbeatAt" = now(), "updatedAt" = now()
        WHERE "id" = $1`,
      [bridgeId]
    );
  } catch (err) {
    console.error("[bridge-gateway] markOnline db error:", err.message);
  }
}

/** Touch heartbeat timestamp. Best-effort. */
async function touchHeartbeat(bridgeId) {
  if (!pool || !bridgeId) return;
  try {
    await pool.query(
      `UPDATE "Bridge" SET "lastHeartbeatAt" = now(), "updatedAt" = now() WHERE "id" = $1`,
      [bridgeId]
    );
  } catch (err) {
    console.error("[bridge-gateway] touchHeartbeat db error:", err.message);
  }
}

/** Build a protocol v1 envelope. */
function envelope(type, payload, corr) {
  const env = {
    v: PROTOCOL,
    id: crypto.randomUUID(),
    type,
    ts: Date.now(),
    payload: payload || {},
  };
  if (corr) env.corr = corr;
  if (type.endsWith("_ack")) env.ack = true;
  return env;
}

function send(ws, env) {
  try {
    ws.send(JSON.stringify(env));
  } catch {
    /* socket already closing */
  }
}

// ---- HTTP server (health) --------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url && req.url.split("?")[0] === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ ok: true, service: "bridge-gateway", protocol: PROTOCOL })
    );
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

// ---- WS server -------------------------------------------------------------

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  const token = extractToken(req);
  const bridgeId = await verifyToken(token);

  if (!bridgeId) {
    // 4401 = application-level "unauthorized" close code.
    try {
      ws.close(4401, "unauthorized");
    } catch {
      /* ignore */
    }
    return;
  }

  ws.bridgeId = bridgeId;
  ws.isAlive = true;

  ws.on("message", async (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      send(ws, envelope("error", { code: "bad_json", message: "invalid frame" }));
      return;
    }

    if (!frame || typeof frame !== "object" || frame.type === undefined) {
      send(ws, envelope("error", { code: "bad_frame", message: "missing type" }));
      return;
    }

    switch (frame.type) {
      case "hello": {
        await markOnline(ws.bridgeId);
        send(
          ws,
          envelope("hello_ack", { ok: true, ts: Date.now() }, frame.id)
        );
        break;
      }
      case "heartbeat": {
        ws.isAlive = true;
        await touchHeartbeat(ws.bridgeId);
        send(ws, envelope("heartbeat_ack", { ok: true, ts: Date.now() }, frame.id));
        break;
      }
      default: {
        // Phase 1 stub: any other frame is acknowledged as unsupported, not fatal.
        send(
          ws,
          envelope(
            "error",
            { code: "unsupported", message: `type '${frame.type}' not handled in phase 1` },
            frame.id
          )
        );
      }
    }
  });

  ws.on("close", () => {
    // Phase 1 stub does not flip status back to offline here; the Cloud's
    // heartbeat-staleness sweep owns offline transitions (Phase 2). Kept simple.
  });

  ws.on("error", () => {
    /* swallow — connection teardown */
  });
});

server.listen(PORT, () => {
  console.log(
    `[bridge-gateway] listening on :${PORT} (protocol v${PROTOCOL}) — health at /health`
  );
});

function shutdown() {
  console.log("[bridge-gateway] shutting down…");
  wss.close();
  server.close(() => {
    if (pool) pool.end().finally(() => process.exit(0));
    else process.exit(0);
  });
  // Hard exit fallback.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
