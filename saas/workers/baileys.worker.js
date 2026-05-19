#!/usr/bin/env node
/*
 * KEYONE Baileys experimental worker scaffold.
 *
 * This is intentionally dormant. It provides an isolated process shape,
 * lifecycle logging, health heartbeat, and graceful shutdown hooks for future
 * Baileys work without importing Baileys or touching production WhatsApp
 * routing. Production traffic MUST NOT be routed here until a later phase.
 */

const http = require("http");

const ENABLED = process.env.ENABLE_BAILEYS === "1";
const PORT = Number(process.env.BAILEYS_WORKER_HEALTH_PORT || 3025);
const startedAt = Date.now();
let shuttingDown = false;

const metrics = {
  enabled: ENABLED,
  routingActive: false,
  sessions: 0,
  reconnects: 0,
  authRestores: 0,
  inboundMessages: 0,
  outboundMessages: 0,
  duplicateDrops: 0,
  lastError: null,
};

function snapshot() {
  return {
    ok: true,
    provider: "baileys",
    enabled: ENABLED,
    routingActive: false,
    pid: process.pid,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    metrics,
    timestamp: new Date().toISOString(),
  };
}

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(snapshot()));
      return;
    }
    if (req.url === "/ready") {
      // Ready is intentionally false while routing is inactive.
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready: false, reason: "baileys_routing_inactive" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[baileys-worker] health listening on http://127.0.0.1:${PORT}/health`);
  });

  server.on("error", (error) => {
    metrics.lastError = error.message;
    console.error("[baileys-worker] health server error:", error.message);
  });

  return server;
}

const healthServer = startHealthServer();

if (!ENABLED) {
  console.log("[baileys-worker] ENABLE_BAILEYS is not 1 — scaffold running in dormant mode.");
} else {
  console.warn("[baileys-worker] ENABLE_BAILEYS=1 but runtime implementation is not wired. No sessions will start.");
}

const heartbeat = setInterval(() => {
  console.log("[baileys-worker] heartbeat", JSON.stringify(snapshot()));
}, Number(process.env.BAILEYS_WORKER_HEARTBEAT_MS || 60000));
if (typeof heartbeat.unref === "function") heartbeat.unref();

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[baileys-worker] received ${signal}; shutting down gracefully`);
  clearInterval(heartbeat);
  healthServer.close(() => {
    console.log("[baileys-worker] stopped");
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
