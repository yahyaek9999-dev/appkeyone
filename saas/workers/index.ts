/**
 * Worker process entry point.
 *
 * Starts all BullMQ workers and exposes a lightweight HTTP health-check
 * server on port 3010 (configurable via WORKER_HEALTH_PORT) so NSSM and
 * external monitoring tools can detect whether the process is alive.
 *
 * Usage (development):
 *   npx ts-node --esm workers/index.ts
 *
 * Usage (production — compile first):
 *   npm run build:workers          # tsc --project tsconfig.workers.json
 *   node dist/workers/index.js
 *
 * NSSM service registration example (Windows):
 *   nssm install mse-workers "C:\Program Files\nodejs\node.exe"
 *   nssm set    mse-workers AppParameters "C:\app\saas\dist\workers\index.js"
 *   nssm set    mse-workers AppDirectory  "C:\app\saas"
 *   nssm set    mse-workers AppEnvExtraPath C:\app\saas\.env
 *   nssm set    mse-workers AppStdout "C:\app\logs\workers.log"
 *   nssm set    mse-workers AppStderr "C:\app\logs\workers.err.log"
 *   nssm start  mse-workers
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { startBroadcastWorker, stopBroadcastWorker } from "./broadcast.worker";
import { closeQueues } from "../lib/queue";

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function validateEnv(): void {
  const required: string[] = [
    "DATABASE_URL",
    "WHATSAPP_SERVICE_URL",
    "SAAS_INTERNAL_SECRET",
  ];

  // When ENABLE_BULLMQ=1, we also need Redis connectivity
  if (process.env.ENABLE_BULLMQ === "1") {
    required.push("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN");
  }

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("[workers] Missing required environment variables:", missing.join(", "));
    console.error("[workers] Ensure .env is loaded (use dotenv-cli or set vars in NSSM).");
    process.exit(1);
  }

  if (process.env.ENABLE_BULLMQ !== "1") {
    console.warn(
      "[workers] ENABLE_BULLMQ is not '1'. Workers started but no queues are active.",
      "Set ENABLE_BULLMQ=1 to enable BullMQ processing."
    );
  }
}

// ---------------------------------------------------------------------------
// Load .env (when not loaded by the shell / NSSM)
// ---------------------------------------------------------------------------

function loadDotenv(): void {
  // Only auto-load in development. In production NSSM sets env vars directly.
  if (process.env.NODE_ENV === "production") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dotenv = require("dotenv") as typeof import("dotenv");
    const envPath = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      console.log("[workers] Loaded .env from", envPath);
    }
  } catch {
    // dotenv not installed — fine in production
  }
}

// ---------------------------------------------------------------------------
// Health-check HTTP server
// ---------------------------------------------------------------------------

interface WorkerStatus {
  name: string;
  running: boolean;
}

const _workerStatuses: WorkerStatus[] = [];
let _startedAt: Date | null = null;

function createHealthServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }

    const url = req.url ?? "/";

    // GET /health — returns 200 if process is alive
    if (url === "/health" || url === "/") {
      const payload = {
        ok: true,
        pid: process.pid,
        uptime: _startedAt
          ? Math.floor((Date.now() - _startedAt.getTime()) / 1000)
          : 0,
        workers: _workerStatuses,
        enableBullmq: process.env.ENABLE_BULLMQ === "1",
        nodeVersion: process.version,
        ts: new Date().toISOString(),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      return;
    }

    // GET /ready — returns 200 only if all workers started successfully
    if (url === "/ready") {
      const allReady = _workerStatuses.every((w) => w.running);
      res.writeHead(allReady ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready: allReady, workers: _workerStatuses }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[workers] Health server listening on http://127.0.0.1:${port}/health`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[workers] Port ${port} already in use — health server disabled.`);
    } else {
      console.error("[workers] Health server error:", err.message);
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let _shuttingDown = false;
let _healthServer: http.Server | null = null;

async function shutdown(signal: string): Promise<void> {
  if (_shuttingDown) return;
  _shuttingDown = true;

  console.log(`\n[workers] Received ${signal} — shutting down gracefully...`);

  // 1. Stop accepting new jobs
  try {
    await stopBroadcastWorker();
  } catch (e) {
    console.error("[workers] Error stopping broadcast worker:", e);
  }

  // 2. Close BullMQ queue connections
  try {
    await closeQueues();
  } catch (e) {
    console.error("[workers] Error closing queues:", e);
  }

  // 3. Close health server
  if (_healthServer) {
    await new Promise<void>((resolve) => _healthServer!.close(() => resolve()));
    console.log("[workers] Health server closed.");
  }

  console.log("[workers] Shutdown complete.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadDotenv();
  validateEnv();

  _startedAt = new Date();
  const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || "3010", 10);

  console.log("=".repeat(60));
  console.log(" KEYONE Worker Process");
  console.log(" PID:", process.pid);
  console.log(" Node:", process.version);
  console.log(" ENV:", process.env.NODE_ENV ?? "development");
  console.log(" ENABLE_BULLMQ:", process.env.ENABLE_BULLMQ ?? "0");
  console.log("=".repeat(60));

  // Start workers
  if (process.env.ENABLE_BULLMQ === "1") {
    try {
      startBroadcastWorker();
      _workerStatuses.push({ name: "broadcast", running: true });
      console.log("[workers] Broadcast worker started.");
    } catch (e) {
      console.error("[workers] Failed to start broadcast worker:", e);
      _workerStatuses.push({ name: "broadcast", running: false });
    }

    // Future workers:
    // startNotificationWorker(); _workerStatuses.push({ name: "notification", running: true });
    // startWebhookWorker();      _workerStatuses.push({ name: "webhook", running: true });
  } else {
    console.log("[workers] BullMQ disabled — no workers started.");
    console.log("[workers] Set ENABLE_BULLMQ=1 to activate queue processing.");
  }

  // Health server (always runs, even when BullMQ is disabled)
  _healthServer = createHealthServer(healthPort);

  // Signal handlers
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGHUP",  () => shutdown("SIGHUP"));

  // Unhandled rejection safety net
  process.on("unhandledRejection", (reason) => {
    console.error("[workers] Unhandled promise rejection:", reason);
    // Do NOT exit — let BullMQ retry logic handle failed jobs
  });

  process.on("uncaughtException", (err) => {
    console.error("[workers] Uncaught exception:", err);
    // Exit and let NSSM restart the process
    void shutdown("uncaughtException").then(() => process.exit(1));
  });

  console.log("[workers] Ready. Workers:", _workerStatuses.map((w) => w.name).join(", ") || "(none)");
}

main().catch((err) => {
  console.error("[workers] Fatal startup error:", err);
  process.exit(1);
});
