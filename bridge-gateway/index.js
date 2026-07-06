// KEYONE Bridge Gateway — Phase 2 relay.
//
// A standalone WS ingress that carries a customer-hosted Bridge's transport
// traffic to/from the Cloud. It holds NO WhatsApp auth and NEVER touches the
// send pipeline code; it is pure relay + auth. Everything here only runs when a
// Bridge deliberately connects and a bridge-mode tenant deliberately routes
// through it (both gated by BRIDGE_ENABLED on the Cloud side).
//
// What it does (Phase 2):
//   AUTH   — a connecting Bridge is authenticated at WS-upgrade time by its
//            token (sha256(token) must match a live, non-revoked BridgeToken).
//   HELLO  — answers `hello`; marks the owning Bridge online.
//   BEAT   — answers `heartbeat`; touches lastHeartbeatAt; ws ping keepalive.
//   INBOUND— a Bridge `inbound` frame is relayed 1:1 to the SAME Cloud endpoint
//            the whatsapp-web.js gateway uses (POST /api/whatsapp/incoming with
//            x-internal-secret). The synchronous `{reply}` from that endpoint is
//            pushed straight back to the Bridge as an `outbound` frame — exactly
//            mirroring what the wa-service does with the HTTP response.
//   OUTBOUND (async) — the Cloud posts to POST /internal/outbound (localhost,
//            x-internal-secret). The gateway pushes an `outbound` frame to the
//            tenant's primary online Bridge and waits for `outbound_ack`.
//   STATE  — a Bridge `state` frame updates the BridgeTransport row.
//   LINK   — a Bridge `link_artifact` frame (e.g. a QR string) is stashed in
//            memory per bridge for the Dashboard to render (Phase 3 wires the UI).
//   OFFLINE— socket close flips the Bridge offline immediately; a periodic sweep
//            covers crash-without-close (no FIN) by staleness.
//
// Protocol v1 envelope: { v:1, id, type, ts, corr?, ack?, payload? }
//
// Env:
//   POSTGRES_URL / DATABASE_URL   Cloud Postgres (token verify + status writes)
//   SAAS_INTERNAL_SECRET          shared secret for Cloud <-> gateway internal HTTP
//   CLOUD_INCOMING_URL            inbound target (default http://127.0.0.1:3000/api/whatsapp/incoming)
//   BRIDGE_GATEWAY_PORT           listen port (default 3002)
//   BRIDGE_HEARTBEAT_TIMEOUT_MS   offline-staleness threshold (default 90000)

const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const PROTOCOL = 1;
const PORT = Number(process.env.BRIDGE_GATEWAY_PORT || 3002);
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
const INTERNAL_SECRET = process.env.SAAS_INTERNAL_SECRET || "";
const CLOUD_INCOMING_URL =
  process.env.CLOUD_INCOMING_URL ||
  "http://127.0.0.1:3000/api/whatsapp/incoming";
const HEARTBEAT_TIMEOUT_MS = Number(
  process.env.BRIDGE_HEARTBEAT_TIMEOUT_MS || 90_000,
);
const OUTBOUND_ACK_TIMEOUT_MS = Number(
  process.env.BRIDGE_OUTBOUND_ACK_TIMEOUT_MS || 30_000,
);
const PING_INTERVAL_MS = 30_000;
const SWEEP_INTERVAL_MS = 60_000;

// A single shared pool. If no URL is configured, token verification always fails
// closed (safer than accepting unverified Bridges).
const pool = POSTGRES_URL
  ? new Pool({ connectionString: POSTGRES_URL, max: 4 })
  : null;

if (!pool) {
  console.warn(
    "[bridge-gateway] POSTGRES_URL not set — every connection will be rejected (fail-closed).",
  );
}
if (!INTERNAL_SECRET) {
  console.warn(
    "[bridge-gateway] SAAS_INTERNAL_SECRET not set — inbound relay and /internal/* will fail closed.",
  );
}

// ---- registries ------------------------------------------------------------
// bridgeId -> ws (the live socket for that bridge)
const bridgesById = new Map();
// userId -> Set<ws> (a workspace may run multiple bridges; we pick the primary)
const socketsByUser = new Map();
// latest link artifact (e.g. QR) per bridgeId, for the Dashboard to render
const lastLinkArtifact = new Map();
// pending outbound sends awaiting ack: frameId -> { resolve, timer }
const pendingAcks = new Map();

/** sha256 hex — the exact hash the Cloud stores in BridgeToken.tokenHash. */
function sha256(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** Constant-time string compare for the internal secret. */
function secretMatches(provided) {
  if (!INTERNAL_SECRET || !provided) return false;
  const a = Buffer.from(INTERNAL_SECRET, "utf8");
  const b = Buffer.from(String(provided), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
 * Verify a Bridge token against the Cloud. Returns { bridgeId, userId, isPrimary }
 * on success, or null on any failure. Fails closed on missing config / db error.
 */
async function verifyToken(token) {
  if (!token || !pool) return null;
  const tokenHash = sha256(token);
  try {
    const { rows } = await pool.query(
      `SELECT t."bridgeId", b."userId", b."isPrimary"
         FROM "BridgeToken" t
         JOIN "Bridge" b ON b."id" = t."bridgeId"
        WHERE t."tokenHash" = $1
          AND t."revokedAt" IS NULL
          AND b."revokedAt" IS NULL
        LIMIT 1`,
      [tokenHash],
    );
    if (rows.length === 0) return null;

    // Best-effort touch — never fatal.
    pool
      .query(`UPDATE "BridgeToken" SET "lastUsedAt" = now() WHERE "tokenHash" = $1`, [
        tokenHash,
      ])
      .catch(() => {});

    return {
      bridgeId: rows[0].bridgeId,
      userId: rows[0].userId,
      isPrimary: !!rows[0].isPrimary,
    };
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
      [bridgeId],
    );
  } catch (err) {
    console.error("[bridge-gateway] markOnline db error:", err.message);
  }
}

/** Mark a Bridge offline. Best-effort. */
async function markOffline(bridgeId) {
  if (!pool || !bridgeId) return;
  try {
    await pool.query(
      `UPDATE "Bridge" SET "status" = 'offline', "updatedAt" = now() WHERE "id" = $1`,
      [bridgeId],
    );
  } catch (err) {
    console.error("[bridge-gateway] markOffline db error:", err.message);
  }
}

/** Touch heartbeat timestamp. Best-effort. */
async function touchHeartbeat(bridgeId) {
  if (!pool || !bridgeId) return;
  try {
    await pool.query(
      `UPDATE "Bridge" SET "lastHeartbeatAt" = now(), "updatedAt" = now() WHERE "id" = $1`,
      [bridgeId],
    );
  } catch (err) {
    console.error("[bridge-gateway] touchHeartbeat db error:", err.message);
  }
}

/** Upsert a BridgeTransport state row (provider connection state / identity). */
async function upsertTransportState(bridgeId, provider, state, identity) {
  if (!pool || !bridgeId || !provider) return;
  try {
    await pool.query(
      `INSERT INTO "BridgeTransport" ("id","bridgeId","provider","state","identity","updatedAt")
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT ("bridgeId","provider")
       DO UPDATE SET "state" = EXCLUDED."state",
                     "identity" = COALESCE(EXCLUDED."identity", "BridgeTransport"."identity"),
                     "updatedAt" = now()`,
      [crypto.randomUUID(), bridgeId, provider, String(state || "disconnected"), identity || null],
    );
  } catch (err) {
    console.error("[bridge-gateway] upsertTransportState db error:", err.message);
  }
}

/**
 * Mark a Bridge online AND persist the device metadata it announced at hello
 * (os/arch/version/name/capabilities). Also clears any prior updating/error flag
 * — a Bridge that just said hello is up and running (e.g. after a self-update).
 */
async function markOnlineWithMeta(bridgeId, meta) {
  if (!pool || !bridgeId) return;
  try {
    await pool.query(
      `UPDATE "Bridge"
          SET "status" = 'online', "lastHeartbeatAt" = now(), "updatedAt" = now(),
              "updating" = false, "lastError" = NULL,
              "os" = COALESCE($2, "os"),
              "arch" = COALESCE($3, "arch"),
              "version" = COALESCE($4, "version"),
              "name" = COALESCE("name", $5),
              "capabilities" = COALESCE($6, "capabilities")
        WHERE "id" = $1`,
      [
        bridgeId,
        meta.os || null,
        meta.arch || null,
        meta.version || null,
        meta.name || null,
        meta.capabilities ? JSON.stringify(meta.capabilities) : null,
      ],
    );
  } catch (err) {
    console.error("[bridge-gateway] markOnlineWithMeta db error:", err.message);
  }
}

/** Persist the latest streamed QR string for a provider (Dashboard display). */
async function persistQr(bridgeId, provider, qr) {
  if (!pool || !bridgeId || !provider) return;
  try {
    await pool.query(
      `INSERT INTO "BridgeTransport" ("id","bridgeId","provider","state","lastQr","lastQrAt","updatedAt")
       VALUES ($1,$2,$3,'linking',$4, now(), now())
       ON CONFLICT ("bridgeId","provider")
       DO UPDATE SET "lastQr" = EXCLUDED."lastQr", "lastQrAt" = now(), "updatedAt" = now()`,
      [crypto.randomUUID(), bridgeId, provider, String(qr || "").slice(0, 8192)],
    );
  } catch (err) {
    console.error("[bridge-gateway] persistQr db error:", err.message);
  }
}

/** Append a streamed log line, trimming the per-bridge ring to ~500 lines. */
async function insertLog(bridgeId, level, message) {
  if (!pool || !bridgeId || !message) return;
  try {
    await pool.query(
      `INSERT INTO "BridgeLogLine" ("id","bridgeId","at","level","message")
       VALUES ($1,$2, now(), $3, $4)`,
      [crypto.randomUUID(), bridgeId, String(level || "info").slice(0, 12), String(message).slice(0, 2000)],
    );
    // Best-effort ring trim (keep newest 500).
    pool
      .query(
        `DELETE FROM "BridgeLogLine"
          WHERE "bridgeId" = $1
            AND "id" NOT IN (
              SELECT "id" FROM "BridgeLogLine" WHERE "bridgeId" = $1 ORDER BY "at" DESC LIMIT 500
            )`,
        [bridgeId],
      )
      .catch(() => {});
  } catch (err) {
    console.error("[bridge-gateway] insertLog db error:", err.message);
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

/** Pick the socket to deliver a user's outbound to: the primary, else any online. */
function pickUserSocket(userId) {
  const set = socketsByUser.get(userId);
  if (!set || set.size === 0) return null;
  let fallback = null;
  for (const ws of set) {
    if (ws.readyState !== ws.OPEN) continue;
    if (ws.isPrimary) return ws;
    if (!fallback) fallback = ws;
  }
  return fallback;
}

/**
 * Push an `outbound` frame to a Bridge and await its ack.
 * Resolves { ok, providerMessageId? } / { ok:false, error }.
 */
function pushOutbound(ws, provider, to, text) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== ws.OPEN) {
      resolve({ ok: false, error: "bridge_socket_closed" });
      return;
    }
    const frame = envelope("outbound", { provider: provider || "whatsapp", to, text });
    const timer = setTimeout(() => {
      pendingAcks.delete(frame.id);
      resolve({ ok: false, error: "ack_timeout" });
    }, OUTBOUND_ACK_TIMEOUT_MS);
    pendingAcks.set(frame.id, { resolve, timer });
    send(ws, frame);
  });
}

/** Relay one inbound message to the Cloud; return the {reply} (or null). */
async function relayInbound(userId, payload) {
  if (!INTERNAL_SECRET) return null;
  const body = {
    event: "incoming",
    userId,
    from: payload.from || { phone: payload.fromPhone, name: payload.fromName },
    mediaType: payload.mediaType || "text",
    text: payload.text || "",
    mediaBase64: payload.mediaBase64,
    mimetype: payload.mimetype,
    providerMessageId: payload.providerMessageId || null,
    providerTimestamp: payload.providerTimestamp || null,
  };
  try {
    const res = await fetch(CLOUD_INCOMING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[bridge-gateway] cloud incoming responded", res.status);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (e) {
    console.error("[bridge-gateway] cloud incoming unreachable:", e.message);
    return null;
  }
}

// ---- HTTP server (health + internal outbound) ------------------------------

const server = http.createServer((req, res) => {
  const path = (req.url || "").split("?")[0];

  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "bridge-gateway",
        protocol: PROTOCOL,
        bridges: bridgesById.size,
      }),
    );
    return;
  }

  // Internal: Cloud -> gateway outbound push. Localhost + secret only.
  if (req.method === "POST" && path === "/internal/outbound") {
    if (!secretMatches(req.headers["x-internal-secret"])) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy(); // 1MB guard
    });
    req.on("end", async () => {
      let msg;
      try {
        msg = JSON.parse(raw || "{}");
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "bad_json" }));
        return;
      }
      const { userId, provider, to, text } = msg || {};
      if (!userId || !to) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "userId and to required" }));
        return;
      }
      const ws = pickUserSocket(userId);
      if (!ws) {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "no_bridge_online" }));
        return;
      }
      const result = await pushOutbound(ws, provider, to, text);
      res.writeHead(result.ok ? 200 : 502, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    });
    return;
  }

  // Internal: Cloud -> gateway latest link artifact (QR) for a bridge.
  if (req.method === "GET" && path === "/internal/qr") {
    if (!secretMatches(req.headers["x-internal-secret"])) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }
    let bridgeId = "";
    try {
      bridgeId = new URL(req.url, "http://localhost").searchParams.get("bridgeId") || "";
    } catch {
      /* ignore */
    }
    const artifact = lastLinkArtifact.get(bridgeId) || null;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, artifact }));
    return;
  }

  // Internal: Cloud -> gateway control push (Dashboard drives the Bridge).
  // Pushes a `control` frame (start_qr | reconnect | restart | update |
  // disconnect) to the user's primary online Bridge.
  if (req.method === "POST" && path === "/internal/control") {
    if (!secretMatches(req.headers["x-internal-secret"])) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 100_000) req.destroy();
    });
    req.on("end", () => {
      let msg;
      try {
        msg = JSON.parse(raw || "{}");
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "bad_json" }));
        return;
      }
      const { userId, action, provider } = msg || {};
      const ALLOWED = ["start_qr", "reconnect", "restart", "update", "disconnect"];
      if (!userId || !ALLOWED.includes(action)) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "userId and valid action required" }));
        return;
      }
      const ws = pickUserSocket(userId);
      if (!ws) {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "no_bridge_online" }));
        return;
      }
      send(ws, envelope("control", { action, provider: provider || "whatsapp" }));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, action }));
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

// ---- WS server -------------------------------------------------------------

// Authenticate DURING the HTTP upgrade (before 'connection' fires). This avoids a
// race where the client's first frame (hello) arrives before the async token
// check finishes and the 'message' listener is attached — which would drop hello.
// NOTE: no `path` restriction — Phase 1's verified handshake accepted WS on any
// path (the gateway is localhost-only; Caddy will later reverse_proxy /bridge to
// it, preserving the path, at Phase-2 go-live). Auth is by token, not by path.
const wss = new WebSocketServer({
  server,
  verifyClient: (info, cb) => {
    const token = extractToken(info.req);
    verifyToken(token)
      .then((ident) => {
        if (ident) {
          info.req._bridge = ident; // { bridgeId, userId, isPrimary }
          cb(true);
        } else {
          cb(false, 401, "unauthorized");
        }
      })
      .catch(() => cb(false, 401, "unauthorized"));
  },
});

function register(ws) {
  bridgesById.set(ws.bridgeId, ws);
  let set = socketsByUser.get(ws.userId);
  if (!set) {
    set = new Set();
    socketsByUser.set(ws.userId, set);
  }
  set.add(ws);
}

function deregister(ws) {
  if (bridgesById.get(ws.bridgeId) === ws) bridgesById.delete(ws.bridgeId);
  const set = socketsByUser.get(ws.userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) socketsByUser.delete(ws.userId);
  }
}

wss.on("connection", (ws, req) => {
  const ident = req._bridge || {};
  ws.bridgeId = ident.bridgeId;
  ws.userId = ident.userId;
  ws.isPrimary = !!ident.isPrimary;
  ws.isAlive = true;
  register(ws);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

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
    const p = frame.payload || {};

    switch (frame.type) {
      case "hello": {
        // Persist the device metadata the Bridge announced (os/arch/version/…)
        // so the Dashboard's "Connected Device" card has real data.
        await markOnlineWithMeta(ws.bridgeId, {
          os: p.os,
          arch: p.arch,
          version: p.version,
          name: p.name,
          capabilities: p.capabilities,
        });
        send(ws, envelope("hello_ack", { ok: true, ts: Date.now() }, frame.id));
        break;
      }
      case "heartbeat": {
        ws.isAlive = true;
        await touchHeartbeat(ws.bridgeId);
        send(ws, envelope("heartbeat_ack", { ok: true, ts: Date.now() }, frame.id));
        break;
      }
      case "inbound": {
        // Relay 1:1 to the Cloud; push the synchronous reply back as `outbound`.
        // Ack the inbound immediately so the Bridge can free its buffer.
        send(ws, envelope("inbound_ack", { ok: true }, frame.id));
        const result = await relayInbound(ws.userId, p);
        if (result && result.reply) {
          // Fire-and-forget the reply (the Bridge acks it via outbound_ack).
          pushOutbound(ws, p.provider || "whatsapp", p.from?.phone || p.fromPhone, result.reply);
        }
        break;
      }
      case "state": {
        await upsertTransportState(ws.bridgeId, p.provider || "whatsapp", p.state, p.identity);
        send(ws, envelope("state_ack", { ok: true }, frame.id));
        break;
      }
      case "link_artifact": {
        // e.g. a QR string generated locally on the Bridge. Stash for the Dashboard.
        // Cap the payload — a QR string is well under 1KB; anything larger is bogus.
        const data = typeof p.data === "string" ? p.data.slice(0, 8192) : "";
        const provider = p.provider || "whatsapp";
        lastLinkArtifact.set(ws.bridgeId, {
          provider,
          kind: p.kind || "qr",
          data,
          expiresAt: p.expiresAt || null,
          receivedAt: Date.now(),
        });
        // Persist so the Dashboard can render the QR (DB-backed, survives restart).
        await persistQr(ws.bridgeId, provider, data);
        send(ws, envelope("link_artifact_ack", { ok: true }, frame.id));
        break;
      }
      case "log": {
        // The Bridge streams recent log lines so the customer reads them in the
        // Dashboard without opening the Bridge app.
        await insertLog(ws.bridgeId, p.level, p.message);
        send(ws, envelope("log_ack", { ok: true }, frame.id));
        break;
      }
      case "outbound_ack": {
        const pend = pendingAcks.get(frame.corr);
        if (pend) {
          clearTimeout(pend.timer);
          pendingAcks.delete(frame.corr);
          pend.resolve({ ok: true, providerMessageId: p.providerMessageId || null });
        }
        break;
      }
      case "outbound_nack": {
        const pend = pendingAcks.get(frame.corr);
        if (pend) {
          clearTimeout(pend.timer);
          pendingAcks.delete(frame.corr);
          pend.resolve({ ok: false, error: p.error || "bridge_send_failed" });
        }
        break;
      }
      default: {
        send(
          ws,
          envelope(
            "error",
            { code: "unsupported", message: `type '${frame.type}' not handled` },
            frame.id,
          ),
        );
      }
    }
  });

  ws.on("close", () => {
    deregister(ws);
    // If this bridge has no other live socket, flip it offline immediately and
    // drop its cached link artifact (a reconnecting bridge re-streams a fresh one).
    if (!bridgesById.has(ws.bridgeId)) {
      markOffline(ws.bridgeId);
      lastLinkArtifact.delete(ws.bridgeId);
    }
  });

  ws.on("error", () => {
    /* swallow — connection teardown */
  });
});

// ---- keepalive: terminate sockets that stop responding to pings ------------
const pingTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate(); // triggers 'close' -> deregister + markOffline
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, PING_INTERVAL_MS);
pingTimer.unref();

// ---- staleness sweep: covers crash-without-close (no FIN) ------------------
const sweepTimer = setInterval(async () => {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE "Bridge"
          SET "status" = 'offline', "updatedAt" = now()
        WHERE "status" = 'online'
          AND ("lastHeartbeatAt" IS NULL
               OR "lastHeartbeatAt" < now() - ($1::int || ' milliseconds')::interval)`,
      [HEARTBEAT_TIMEOUT_MS],
    );
  } catch (err) {
    console.error("[bridge-gateway] staleness sweep db error:", err.message);
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref();

server.listen(PORT, () => {
  console.log(
    `[bridge-gateway] listening on :${PORT} (protocol v${PROTOCOL}) — WS /bridge, health /health`,
  );
});

function shutdown() {
  console.log("[bridge-gateway] shutting down…");
  clearInterval(pingTimer);
  clearInterval(sweepTimer);
  wss.close();
  server.close(() => {
    if (pool) pool.end().finally(() => process.exit(0));
    else process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
