/**
 * BullMQ queue definitions.
 *
 * Queues are only instantiated when ENABLE_BULLMQ=1. When the flag is 0
 * (the default), all exports are null-safe stubs so the existing
 * Windows Scheduled Task / cron-based system keeps running unchanged.
 *
 * When an operator sets ENABLE_BULLMQ=1 and starts `node workers/index.js`,
 * BullMQ takes over job dispatch for broadcasts, notifications, AI jobs, and
 * webhooks. The cron routes remain in place as a fallback — they are no-ops
 * when the BullMQ worker has already claimed a job.
 *
 * IMPORTANT: This file may be imported by Next.js server code (for enqueuing
 * only). Workers must NOT import Next.js app code back — that would create
 * circular dependencies. All worker-specific imports live in workers/.
 */

// ---------------------------------------------------------------------------
// BullMQ is an optional peer dependency.  We import dynamically so that the
// Next.js bundle does NOT include ioredis (a Node.js-only package) unless
// ENABLE_BULLMQ=1 and the code path is actually exercised.
// ---------------------------------------------------------------------------

// ---- Job payload type definitions -----------------------------------------

export interface BroadcastJobData {
  broadcastId: string;
  userId: string;
  /** Batch size override (default 20) */
  batchSize?: number;
}

export interface NotificationJobData {
  userId: string;
  /** "order_alert" | "system" | "follow_up" | "daily_report" */
  kind: "order_alert" | "system" | "follow_up" | "daily_report";
  phone: string;
  message: string;
  /** Optional metadata stored alongside the job for tracing */
  meta?: Record<string, unknown>;
}

export interface AiJobData {
  userId: string;
  botId: string;
  conversationId: string;
  customerId: string;
  inboundText: string;
  /** ISO timestamp of when the message arrived (for latency tracking) */
  arrivedAt: string;
}

export interface WebhookJobData {
  webhookEventId: string;
  source: "meta_cloud" | string;
  /** Raw JSON body (already stored in WaWebhookEvent, kept here for fast-path retries) */
  rawBody: string;
  userId?: string;
}

// Dead-letter job wraps the original payload for introspection
export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string | undefined;
  originalData: unknown;
  failedReason: string;
  failedAt: string;
}

// ---- Queue names -----------------------------------------------------------

export const QUEUE_NAMES = {
  broadcasts: "keyone:broadcasts",
  notifications: "keyone:notifications",
  aiJobs: "keyone:ai-jobs",
  webhooks: "keyone:webhooks",
  deadLetter: "keyone:dead-letter",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ---- Retry / backoff policies per queue ------------------------------------

const RETRY_BROADCAST = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 10_000 }, // 10s, 20s, 40s, 80s, 160s
};

const RETRY_NOTIFICATION = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
};

const RETRY_AI = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 3_000 },
};

const RETRY_WEBHOOK = {
  attempts: 7,
  backoff: { type: "exponential" as const, delay: 2_000 }, // Max ~4 min total
};

// ---- Default job options per queue -----------------------------------------

const JOB_OPTIONS = {
  broadcasts:    { removeOnComplete: { count: 100 }, removeOnFail: { count: 500 }, ...RETRY_BROADCAST },
  notifications: { removeOnComplete: { count: 200 }, removeOnFail: { count: 200 }, ...RETRY_NOTIFICATION },
  aiJobs:        { removeOnComplete: { count: 50  }, removeOnFail: { count: 200 }, ...RETRY_AI },
  webhooks:      { removeOnComplete: { count: 200 }, removeOnFail: { count: 500 }, ...RETRY_WEBHOOK },
  deadLetter:    { removeOnComplete: false, removeOnFail: false, attempts: 1 },
} as const;

// ---- Runtime state ---------------------------------------------------------

type BullMQQueue = import("bullmq").Queue;

interface QueueSet {
  broadcasts:    BullMQQueue;
  notifications: BullMQQueue;
  aiJobs:        BullMQQueue;
  webhooks:      BullMQQueue;
  deadLetter:    BullMQQueue;
}

let _queues: QueueSet | null = null;
let _initialized = false;

// ---- Shared ioredis connection for enqueuing (NOT for workers) ------------
// Workers create their own connection via getWorkerConnection().

let _ioredis: import("ioredis").Redis | null = null;

function getIoRedisUrl(): string {
  const url = process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || "";

  // Upstash provides a standard Redis URL separately from the REST URL.
  // Prefer UPSTASH_REDIS_URL (ioredis-compatible rediss:// URL).
  const directUrl = process.env.UPSTASH_REDIS_URL;
  if (directUrl) return directUrl;

  // Derive from REST URL: https://kind-jawfish-128295.upstash.io
  //                    → rediss://:TOKEN@kind-jawfish-128295.upstash.io:6380
  if (url && token) {
    const host = url.replace(/^https?:\/\//, "");
    return `rediss://:${token}@${host}:6380`;
  }
  throw new Error(
    "Cannot build ioredis URL: set UPSTASH_REDIS_URL (preferred) or both " +
      "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN"
  );
}

/**
 * Returns a new ioredis connection suitable for a BullMQ Worker or QueueScheduler.
 * Each worker should call this independently (BullMQ requires dedicated connections).
 */
export function getWorkerConnection(): import("ioredis").Redis {
  // Dynamic require so this module stays importable inside Next.js without
  // bundling ioredis when ENABLE_BULLMQ=0.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IORedis = require("ioredis") as typeof import("ioredis");
  return new IORedis.default(getIoRedisUrl(), {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 10_000,
    tls: getIoRedisUrl().startsWith("rediss://") ? {} : undefined,
  });
}

// ---- Initialization ---------------------------------------------------------

/**
 * Initialises BullMQ queues. Idempotent — safe to call multiple times.
 * Returns null when ENABLE_BULLMQ != "1" or Redis is not configured.
 */
export function initQueues(): QueueSet | null {
  if (_initialized) return _queues;
  _initialized = true;

  if (process.env.ENABLE_BULLMQ !== "1") {
    console.log("[queue] ENABLE_BULLMQ != 1 — BullMQ queues disabled. Cron system active.");
    return null;
  }

  try {
    // Lazy import — only pulled in when feature flag is on
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Queue } = require("bullmq") as typeof import("bullmq");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const IORedis = require("ioredis") as typeof import("ioredis");

    _ioredis = new IORedis.default(getIoRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 10_000,
      tls: getIoRedisUrl().startsWith("rediss://") ? {} : undefined,
    });

    const makeQueue = (name: string, opts: object) =>
      new Queue(name, {
        connection: _ioredis! as any,
        defaultJobOptions: opts,
      });

    _queues = {
      broadcasts:    makeQueue(QUEUE_NAMES.broadcasts,    JOB_OPTIONS.broadcasts),
      notifications: makeQueue(QUEUE_NAMES.notifications, JOB_OPTIONS.notifications),
      aiJobs:        makeQueue(QUEUE_NAMES.aiJobs,        JOB_OPTIONS.aiJobs),
      webhooks:      makeQueue(QUEUE_NAMES.webhooks,      JOB_OPTIONS.webhooks),
      deadLetter:    makeQueue(QUEUE_NAMES.deadLetter,    JOB_OPTIONS.deadLetter),
    };

    console.log("[queue] BullMQ queues initialised:", Object.values(QUEUE_NAMES).join(", "));
    return _queues;
  } catch (err) {
    console.error("[queue] Failed to initialise BullMQ queues:", err);
    return null;
  }
}

/** Returns the queue set if already initialised, or null. */
export function getQueues(): QueueSet | null {
  return _queues;
}

// ---- Convenience enqueue helpers -------------------------------------------

/**
 * Enqueue a broadcast processing job.
 * No-ops gracefully when BullMQ is disabled.
 */
export async function enqueueBroadcast(data: BroadcastJobData): Promise<string | null> {
  const qs = initQueues();
  if (!qs) return null;
  try {
    const job = await qs.broadcasts.add("process", data, {
      jobId: `broadcast:${data.broadcastId}`, // Idempotent — duplicate enqueues are no-ops
    });
    return job.id ?? null;
  } catch (e) {
    console.warn("[queue] enqueueBroadcast failed:", e);
    return null;
  }
}

/**
 * Enqueue a notification send job.
 */
export async function enqueueNotification(data: NotificationJobData): Promise<string | null> {
  const qs = initQueues();
  if (!qs) return null;
  try {
    const job = await qs.notifications.add(data.kind, data);
    return job.id ?? null;
  } catch (e) {
    console.warn("[queue] enqueueNotification failed:", e);
    return null;
  }
}

/**
 * Enqueue an AI inference job (for async / background processing).
 */
export async function enqueueAiJob(data: AiJobData): Promise<string | null> {
  const qs = initQueues();
  if (!qs) return null;
  try {
    const job = await qs.aiJobs.add("infer", data);
    return job.id ?? null;
  } catch (e) {
    console.warn("[queue] enqueueAiJob failed:", e);
    return null;
  }
}

/**
 * Enqueue a Meta Cloud webhook event for processing.
 */
export async function enqueueWebhook(data: WebhookJobData): Promise<string | null> {
  const qs = initQueues();
  if (!qs) return null;
  try {
    const job = await qs.webhooks.add("process", data, {
      jobId: `webhook:${data.source}:${data.webhookEventId}`, // Idempotent
    });
    return job.id ?? null;
  } catch (e) {
    console.warn("[queue] enqueueWebhook failed:", e);
    return null;
  }
}

/**
 * Move a failed job to the dead-letter queue for human inspection.
 */
export async function sendToDeadLetter(data: DeadLetterJobData): Promise<void> {
  const qs = initQueues();
  if (!qs) return;
  try {
    await qs.deadLetter.add("dead", data);
  } catch (e) {
    console.warn("[queue] sendToDeadLetter failed:", e);
  }
}

// ---- Graceful shutdown -----------------------------------------------------

/**
 * Close all queues + the shared ioredis connection.
 * Call this in SIGTERM / SIGINT handlers of the worker process.
 * Safe to call from Next.js server shutdown too (no-op when ENABLE_BULLMQ=0).
 */
export async function closeQueues(): Promise<void> {
  if (!_queues) return;
  try {
    await Promise.allSettled([
      _queues.broadcasts.close(),
      _queues.notifications.close(),
      _queues.aiJobs.close(),
      _queues.webhooks.close(),
      _queues.deadLetter.close(),
    ]);
    await _ioredis?.quit().catch(() => {});
    console.log("[queue] All BullMQ queues closed.");
  } catch (e) {
    console.error("[queue] Error closing queues:", e);
  } finally {
    _queues = null;
    _ioredis = null;
    _initialized = false;
  }
}
