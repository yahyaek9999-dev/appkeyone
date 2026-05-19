#!/usr/bin/env node
/*
 * KEYONE Baileys experimental worker — isolated runtime only.
 *
 * Production safety guarantees:
 * - No production provider routing imports this process.
 * - No production sessions/auth directories are reused.
 * - No DB/order/inbox mutations are performed.
 * - Mutating HTTP endpoints require X-Internal-Secret.
 * - Session ids must use the experimental namespace: exp-<name>.
 * - Outgoing messages require BAILEYS_ALLOW_TEST_SEND=1 plus an explicit
 *   per-request confirmation phrase.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const process = require("process");

loadEnvFile(path.resolve(process.cwd(), ".env"));

const ENABLED = process.env.ENABLE_BAILEYS === "1";
const PORT = Number(process.env.BAILEYS_WORKER_HEALTH_PORT || 3025);
const SECRET =
  process.env.BAILEYS_WORKER_SECRET ||
  process.env.SAAS_INTERNAL_SECRET ||
  "dev-internal-secret-change-me";
const AUTH_ROOT = path.resolve(
  process.env.BAILEYS_AUTH_DIR || path.join(process.cwd(), "baileys-sessions"),
);
const LOG_ROOT = path.resolve(
  process.env.BAILEYS_LOG_DIR || path.join(process.cwd(), "logs", "baileys"),
);
const MAX_SESSIONS = Math.min(
  5,
  Math.max(1, Number(process.env.BAILEYS_MAX_SESSIONS || 1)),
);
const MAX_RECONNECTS = Math.max(
  0,
  Number(process.env.BAILEYS_MAX_RECONNECTS || 5),
);
const RECONNECT_BASE_MS = Math.max(
  500,
  Number(process.env.BAILEYS_RECONNECT_BASE_MS || 1500),
);
const RECONNECT_MAX_MS = Math.max(
  RECONNECT_BASE_MS,
  Number(process.env.BAILEYS_RECONNECT_MAX_MS || 30000),
);
const DUP_TTL_MS = Math.max(
  60000,
  Number(process.env.BAILEYS_DUP_TTL_MS || 10 * 60 * 1000),
);
const AUTORESTORE = process.env.BAILEYS_AUTORESTORE === "1";
const ALLOW_TEST_SEND = process.env.BAILEYS_ALLOW_TEST_SEND === "1";
const TEST_RECIPIENT = (process.env.BAILEYS_TEST_RECIPIENT || "").replace(
  /[^0-9]/g,
  "",
);
const startedAt = Date.now();
const bootCpu = process.cpuUsage();
let shuttingDown = false;
let baileysModulePromise = null;
let pinoPromise = null;

/** @type {Map<string, ExperimentalSession>} */
const sessions = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const reconnectTimers = new Map();
/** @type {Map<string, number>} */
const recentMessageIds = new Map();

const metrics = {
  enabled: ENABLED,
  routingActive: false,
  maxSessions: MAX_SESSIONS,
  sessionsStarted: 0,
  sessionsStopped: 0,
  reconnects: 0,
  reconnectBlocked: 0,
  authRestores: 0,
  authCorruptions: 0,
  inboundMessages: 0,
  outboundMessages: 0,
  duplicateDrops: 0,
  qrGenerated: 0,
  connectionOpens: 0,
  connectionCloses: 0,
  sendBlocked: 0,
  lastError: null,
};

/**
 * @typedef {Object} ExperimentalSession
 * @property {string} id
 * @property {any} sock
 * @property {string} status
 * @property {string|null} qr
 * @property {string|null} phone
 * @property {number} reconnectAttempts
 * @property {number|null} connectedAt
 * @property {number|null} lastOpenAt
 * @property {number|null} lastCloseAt
 * @property {number|null} lastActivityAt
 * @property {string|null} lastDisconnectReason
 * @property {string|null} lastError
 * @property {Array<any>} events
 */

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}

async function ensureDirs() {
  await fsp.mkdir(AUTH_ROOT, { recursive: true });
  await fsp.mkdir(LOG_ROOT, { recursive: true });
}

function logLine(event, payload = {}) {
  const line = safeJson({ ts: new Date().toISOString(), event, ...payload });
  console.log(`[baileys-worker] ${line}`);
  fsp
    .appendFile(path.join(LOG_ROOT, "worker.jsonl"), `${line}\n`)
    .catch(() => {});
}

function sessionLog(id, event, payload = {}) {
  const entry = { ts: new Date().toISOString(), event, ...payload };
  const s = sessions.get(id);
  if (s) {
    s.events.push(entry);
    if (s.events.length > 100) s.events.shift();
  }
  logLine(event, { sessionId: id, ...payload });
  fsp
    .appendFile(path.join(LOG_ROOT, `${id}.jsonl`), `${safeJson(entry)}\n`)
    .catch(() => {});
}

function validSessionId(id) {
  return typeof id === "string" && /^exp-[a-zA-Z0-9_-]{1,64}$/.test(id);
}

function authDirFor(id) {
  if (!validSessionId(id)) throw new Error("invalid experimental session id");
  return path.join(AUTH_ROOT, id);
}

async function authLooksHealthy(dir) {
  if (!fs.existsSync(dir)) return { ok: true, fresh: true };
  const files = await fsp.readdir(dir).catch(() => []);
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      JSON.parse(await fsp.readFile(path.join(dir, file), "utf8"));
    } catch (error) {
      return { ok: false, file, error: error.message };
    }
  }
  return { ok: true, fresh: false };
}

function normalizeRecipient(to) {
  const raw = String(to || "").trim();
  if (raw.endsWith("@s.whatsapp.net") || raw.endsWith("@c.us"))
    return raw.replace("@c.us", "@s.whatsapp.net");
  const digits = raw.replace(/[^0-9]/g, "");
  if (!/^\d{8,15}$/.test(digits)) throw new Error("invalid test recipient");
  return `${digits}@s.whatsapp.net`;
}

function response(res, status, body) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type":
      typeof body === "string"
        ? "text/plain; charset=utf-8"
        : "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.end(payload);
}

function requireAuth(req, res) {
  if (req.headers["x-internal-secret"] === SECRET) return true;
  response(res, 401, { error: "unauthorized" });
  return false;
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 64 * 1024) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text);
}

async function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import("@whiskeysockets/baileys").catch((error) => {
      baileysModulePromise = null;
      throw error;
    });
  }
  return baileysModulePromise;
}

async function loadPino() {
  if (!pinoPromise) {
    pinoPromise = import("pino").then((mod) => mod.default || mod);
  }
  return pinoPromise;
}

function sessionSummary(s) {
  return {
    id: s.id,
    namespace: "experimental",
    status: s.status,
    hasQr: !!s.qr,
    qr: s.qr || null,
    phone: s.phone,
    reconnectAttempts: s.reconnectAttempts,
    connectedAt: s.connectedAt ? new Date(s.connectedAt).toISOString() : null,
    lastOpenAt: s.lastOpenAt ? new Date(s.lastOpenAt).toISOString() : null,
    lastCloseAt: s.lastCloseAt ? new Date(s.lastCloseAt).toISOString() : null,
    lastActivityAt: s.lastActivityAt
      ? new Date(s.lastActivityAt).toISOString()
      : null,
    lastDisconnectReason: s.lastDisconnectReason,
    lastError: s.lastError,
    recentEvents: s.events.slice(-20),
  };
}

function pruneDuplicates() {
  const cutoff = Date.now() - DUP_TTL_MS;
  for (const [id, ts] of recentMessageIds) {
    if (ts < cutoff) recentMessageIds.delete(id);
  }
}

function connectionCode(update) {
  const code =
    update?.lastDisconnect?.error?.output?.statusCode ||
    update?.lastDisconnect?.error?.statusCode ||
    null;
  return code;
}

async function startSession(id, reason = "manual") {
  if (!ENABLED) {
    const err = new Error("ENABLE_BAILEYS is not 1");
    err.code = "disabled";
    throw err;
  }
  if (!validSessionId(id)) {
    const err = new Error("session id must use exp-<name> namespace");
    err.code = "invalid_session_id";
    throw err;
  }
  if (!sessions.has(id) && sessions.size >= MAX_SESSIONS) {
    const err = new Error(`experimental session cap reached (${MAX_SESSIONS})`);
    err.code = "session_cap_reached";
    throw err;
  }

  const existing = sessions.get(id);
  if (
    existing?.sock &&
    ["connecting", "connected", "qr"].includes(existing.status)
  ) {
    return existing;
  }

  const authDir = authDirFor(id);
  const authHealth = await authLooksHealthy(authDir);
  if (!authHealth.ok) {
    metrics.authCorruptions++;
    const s = existing || makeSession(id);
    s.status = "auth_corrupt";
    s.lastError = `auth corruption in ${authHealth.file}: ${authHealth.error}`;
    sessions.set(id, s);
    sessionLog(id, "auth_corrupt", authHealth);
    const err = new Error(s.lastError);
    err.code = "auth_corrupt";
    throw err;
  }
  if (!authHealth.fresh) metrics.authRestores++;

  await fsp.mkdir(authDir, { recursive: true });
  await ensureDirs();

  const baileys = await loadBaileys();
  const makeWASocket = baileys.default || baileys.makeWASocket;
  const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } =
    baileys;
  const pino = await loadPino();
  const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || "silent" });

  const s = existing || makeSession(id);
  s.status = "connecting";
  s.qr = null;
  s.lastError = null;
  sessions.set(id, s);

  sessionLog(id, "start", { reason, authDir, authFresh: authHealth.fresh });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: undefined,
  }));

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    logger,
    browser: ["KEYONE-Experimental", "Chrome", "3A"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });
  s.sock = sock;
  metrics.sessionsStarted++;

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    sessionLog(id, "creds_update");
  });

  sock.ev.on("connection.update", (update) => {
    if (update.qr) {
      s.qr = update.qr;
      s.status = "qr";
      s.lastActivityAt = Date.now();
      metrics.qrGenerated++;
      sessionLog(id, "qr", { qrLength: update.qr.length });
    }

    if (update.connection === "open") {
      s.status = "connected";
      s.qr = null;
      s.connectedAt = s.connectedAt || Date.now();
      s.lastOpenAt = Date.now();
      s.lastActivityAt = Date.now();
      s.reconnectAttempts = 0;
      s.phone = sock.user?.id || null;
      metrics.connectionOpens++;
      sessionLog(id, "connection_open", { phone: s.phone });
    }

    if (update.connection === "close") {
      const code = connectionCode(update);
      const loggedOut = code === DisconnectReason?.loggedOut;
      s.status = loggedOut ? "logged_out" : "disconnected";
      s.sock = null;
      s.lastCloseAt = Date.now();
      s.lastDisconnectReason = code ? String(code) : "unknown";
      metrics.connectionCloses++;
      sessionLog(id, "connection_close", { code, loggedOut });
      if (!loggedOut && !shuttingDown)
        scheduleReconnect(id, "connection_close");
    }
  });

  sock.ev.on("messages.upsert", (event) => {
    pruneDuplicates();
    for (const msg of event.messages || []) {
      const messageId =
        msg.key?.id ||
        `${msg.key?.remoteJid || "unknown"}:${msg.messageTimestamp || Date.now()}`;
      if (recentMessageIds.has(messageId)) {
        metrics.duplicateDrops++;
        sessionLog(id, "duplicate_drop", { messageId });
        continue;
      }
      recentMessageIds.set(messageId, Date.now());
      s.lastActivityAt = Date.now();
      metrics.inboundMessages++;
      sessionLog(id, "message", {
        messageId,
        type: event.type,
        fromMe: !!msg.key?.fromMe,
        remoteJid: msg.key?.remoteJid || null,
        hasMessage: !!msg.message,
      });
    }
  });

  return s;
}

function makeSession(id) {
  return {
    id,
    sock: null,
    status: "created",
    qr: null,
    phone: null,
    reconnectAttempts: 0,
    connectedAt: null,
    lastOpenAt: null,
    lastCloseAt: null,
    lastActivityAt: null,
    lastDisconnectReason: null,
    lastError: null,
    events: [],
  };
}

function scheduleReconnect(id, reason) {
  const s = sessions.get(id);
  if (!s) return;
  if (reconnectTimers.has(id)) return;
  if (s.reconnectAttempts >= MAX_RECONNECTS) {
    metrics.reconnectBlocked++;
    sessionLog(id, "reconnect_blocked", {
      reason,
      attempts: s.reconnectAttempts,
      max: MAX_RECONNECTS,
    });
    return;
  }
  s.reconnectAttempts++;
  metrics.reconnects++;
  const delay = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * Math.pow(2, s.reconnectAttempts - 1),
  );
  sessionLog(id, "reconnect_scheduled", {
    reason,
    attempt: s.reconnectAttempts,
    delayMs: delay,
  });
  const timer = setTimeout(async () => {
    reconnectTimers.delete(id);
    try {
      await startSession(id, "reconnect");
    } catch (error) {
      s.lastError = error.message;
      metrics.lastError = error.message;
      sessionLog(id, "reconnect_failed", { error: error.message });
      scheduleReconnect(id, "reconnect_failed");
    }
  }, delay);
  if (typeof timer.unref === "function") timer.unref();
  reconnectTimers.set(id, timer);
}

async function stopSession(id, removeAuth = false) {
  const s = sessions.get(id);
  if (!s) return { stopped: false, reason: "not_found" };
  const timer = reconnectTimers.get(id);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(id);
  try {
    if (s.sock?.logout && removeAuth) await s.sock.logout();
    else if (s.sock?.end) s.sock.end(undefined);
    else if (s.sock?.ws?.close) s.sock.ws.close();
  } catch (error) {
    s.lastError = error.message;
  }
  s.sock = null;
  s.status = removeAuth ? "logged_out" : "stopped";
  s.lastCloseAt = Date.now();
  metrics.sessionsStopped++;
  sessionLog(id, "stop", { removeAuth });
  if (removeAuth) {
    await fsp
      .rm(authDirFor(id), { recursive: true, force: true })
      .catch(() => {});
  }
  return { stopped: true };
}

async function sendTestMessage(id, body) {
  const s = sessions.get(id);
  if (!s || s.status !== "connected" || !s.sock)
    throw new Error("session_not_connected");
  if (!ALLOW_TEST_SEND) {
    metrics.sendBlocked++;
    throw new Error("BAILEYS_ALLOW_TEST_SEND is not 1");
  }
  if (body.confirm !== "experimental-test-send") {
    metrics.sendBlocked++;
    throw new Error("missing experimental-test-send confirmation");
  }
  const digits = String(body.to || "").replace(/[^0-9]/g, "");
  if (TEST_RECIPIENT && digits !== TEST_RECIPIENT) {
    metrics.sendBlocked++;
    throw new Error("recipient does not match BAILEYS_TEST_RECIPIENT");
  }
  const jid = normalizeRecipient(body.to);
  const text = String(body.text || "").slice(0, 1000);
  if (!text.trim()) throw new Error("text_required");
  const key =
    body.idempotencyKey ||
    `${id}:${jid}:${Buffer.from(text).toString("base64").slice(0, 32)}`;
  if (recentMessageIds.has(`out:${key}`)) {
    metrics.duplicateDrops++;
    return { ok: true, duplicate: true, idempotencyKey: key };
  }
  recentMessageIds.set(`out:${key}`, Date.now());
  const result = await s.sock.sendMessage(jid, { text });
  s.lastActivityAt = Date.now();
  metrics.outboundMessages++;
  sessionLog(id, "test_send", {
    jid,
    idempotencyKey: key,
    providerMsgId: result?.key?.id || null,
  });
  return {
    ok: true,
    providerMsgId: result?.key?.id || null,
    idempotencyKey: key,
  };
}

function processMetrics() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage(bootCpu);
  return {
    rssMb: Math.round(mem.rss / 1048576),
    heapUsedMb: Math.round(mem.heapUsed / 1048576),
    heapTotalMb: Math.round(mem.heapTotal / 1048576),
    cpuUserMs: Math.round(cpu.user / 1000),
    cpuSystemMs: Math.round(cpu.system / 1000),
  };
}

function snapshot() {
  return {
    ok: true,
    provider: "baileys",
    enabled: ENABLED,
    routingActive: false,
    isolated: true,
    namespace: "exp-*",
    authRoot: AUTH_ROOT,
    logRoot: LOG_ROOT,
    pid: process.pid,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    process: processMetrics(),
    metrics,
    sessions: Array.from(sessions.values()).map((s) => ({
      id: s.id,
      status: s.status,
      hasQr: !!s.qr,
      phone: s.phone,
      reconnectAttempts: s.reconnectAttempts,
      lastActivityAt: s.lastActivityAt
        ? new Date(s.lastActivityAt).toISOString()
        : null,
    })),
    timestamp: new Date().toISOString(),
  };
}

async function handle(req, res) {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "127.0.0.1"}`,
  );
  const parts = url.pathname.split("/").filter(Boolean);

  if (
    req.method === "GET" &&
    (url.pathname === "/" || url.pathname === "/health")
  ) {
    response(res, 200, snapshot());
    return;
  }
  if (req.method === "GET" && url.pathname === "/ready") {
    response(res, ENABLED ? 200 : 503, {
      ready: ENABLED,
      routingActive: false,
      reason: ENABLED
        ? "experimental_worker_ready"
        : "ENABLE_BAILEYS_not_enabled",
    });
    return;
  }

  if (!requireAuth(req, res)) return;

  try {
    if (req.method === "GET" && url.pathname === "/sessions") {
      response(res, 200, {
        sessions: Array.from(sessions.values()).map(sessionSummary),
        maxSessions: MAX_SESSIONS,
      });
      return;
    }

    if (parts[0] === "sessions" && parts[1]) {
      const id = parts[1];
      if (!validSessionId(id)) {
        response(res, 400, {
          error: "session id must use exp-<name> namespace",
        });
        return;
      }

      if (req.method === "POST" && parts[2] === "start") {
        const s = await startSession(id, "api");
        response(res, 200, { ok: true, session: sessionSummary(s) });
        return;
      }
      if (
        req.method === "GET" &&
        (!parts[2] || parts[2] === "status" || parts[2] === "qr")
      ) {
        const s = sessions.get(id);
        response(
          res,
          s ? 200 : 404,
          s ? { ok: true, session: sessionSummary(s) } : { error: "not_found" },
        );
        return;
      }
      if (req.method === "POST" && parts[2] === "send") {
        const body = await readBody(req);
        const result = await sendTestMessage(id, body);
        response(res, 200, result);
        return;
      }
      if (
        (req.method === "DELETE" && !parts[2]) ||
        (req.method === "POST" && parts[2] === "stop")
      ) {
        const body =
          req.method === "POST" ? await readBody(req).catch(() => ({})) : {};
        response(res, 200, await stopSession(id, body.removeAuth === true));
        return;
      }
    }

    response(res, 404, { error: "not_found" });
  } catch (error) {
    metrics.lastError = error.message;
    const status =
      error.code === "disabled"
        ? 403
        : error.code === "session_cap_reached"
          ? 429
          : 500;
    response(res, status, {
      error: error.code || "worker_error",
      detail: error.message,
    });
  }
}

async function autorestore() {
  if (!ENABLED || !AUTORESTORE) return;
  await ensureDirs();
  const entries = await fsp.readdir(AUTH_ROOT).catch(() => []);
  const ids = entries.filter(validSessionId).slice(0, MAX_SESSIONS);
  for (const id of ids) {
    try {
      await startSession(id, "autorestore");
    } catch (error) {
      metrics.lastError = error.message;
      sessionLog(id, "autorestore_failed", { error: error.message });
    }
  }
}

async function main() {
  await ensureDirs();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      metrics.lastError = error.message;
      response(res, 500, { error: "unhandled", detail: error.message });
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    logLine("listen", {
      port: PORT,
      enabled: ENABLED,
      authRoot: AUTH_ROOT,
      logRoot: LOG_ROOT,
      maxSessions: MAX_SESSIONS,
    });
  });

  server.on("error", (error) => {
    metrics.lastError = error.message;
    logLine("server_error", { error: error.message });
  });

  const heartbeat = setInterval(
    () => logLine("heartbeat", snapshot()),
    Number(process.env.BAILEYS_WORKER_HEARTBEAT_MS || 60000),
  );
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  await autorestore();

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logLine("shutdown", { signal });
    clearInterval(heartbeat);
    for (const id of Array.from(sessions.keys())) {
      await stopSession(id, false).catch((error) =>
        sessionLog(id, "shutdown_stop_failed", { error: error.message }),
      );
    }
    server.close(() => {
      logLine("stopped");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  metrics.lastError = error.message;
  logLine("fatal", { error: error.stack || error.message });
  process.exit(1);
});
