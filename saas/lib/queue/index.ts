// KEYONE Queue Abstraction Layer
//
// Provides a unified interface for job/task queuing that supports:
//   - SQLite/WaMessage (current production — lib/messaging/outgoing-queue)
//   - BullMQ/Redis (future — workers/broadcast.worker.ts pattern)
//
// Phase 1: Interface + SQLite implementation (wraps existing outgoing-queue).
// Phase 2: BullMQ implementation for Redis-backed queues.
// Phase 3: Unified dispatch with provider-aware routing.

import type { QueueReason, DrainOptions, DrainResult } from "@/lib/messaging/outgoing-queue";

export type { QueueReason, DrainOptions, DrainResult };

export interface QueueMessage {
  userId: string;
  to: string;
  text: string;
  conversationId?: string | null;
  reason?: QueueReason;
  idempotencyKey?: string | null;
  delayMs?: number;
  provider?: "qr" | "meta_cloud";
}

export interface QueueInterface {
  /** Enqueue a message for delivery. Returns { queued, id } or { queued: false, reason }. */
  enqueue(msg: QueueMessage): Promise<{ queued: boolean; id?: string; reason?: string; dueAt?: Date }>;
  /** Drain the queue — process pending messages. */
  drain(opts?: DrainOptions): Promise<DrainResult>;
  /** Get current queue health stats. */
  health(): Promise<{ queued: number; sending: number; sent24h: number; failed24h: number }>;
}

/**
 * SQLite-backed queue (current production).
 * Wraps lib/messaging/outgoing-queue.ts.
 */
export { createSqliteQueue } from "./sqlite-queue";
