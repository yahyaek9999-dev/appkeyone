// SQLite-backed queue — wraps the current lib/messaging/outgoing-queue.
// This is the reference implementation for QueueInterface.
// Phase 2 will add a BullMQ equivalent.

import {
  enqueueOutboundText,
  drainOutgoingQueue as drain,
  getOutgoingQueueHealth,
} from "@/lib/messaging/outgoing-queue";
import type { QueueMessage, QueueInterface, DrainOptions, DrainResult } from "./index";

export function createSqliteQueue(): QueueInterface {
  return {
    async enqueue(msg: QueueMessage) {
      return enqueueOutboundText({
        userId: msg.userId,
        to: msg.to,
        text: msg.text,
        conversationId: msg.conversationId ?? null,
        reason: msg.reason ?? "system",
        idempotencyKey: msg.idempotencyKey ?? null,
        delayMs: msg.delayMs,
        provider: msg.provider ?? "qr",
      });
    },

    async drain(opts?: DrainOptions) {
      return drain(opts ?? {});
    },

    async health() {
      const h = await getOutgoingQueueHealth().catch(() => ({
        queued: -1,
        sending: -1,
        sent24h: -1,
        failed24h: -1,
        oldestQueuedAgeSec: -1,
        staleQueued: -1,
      }));
      return {
        queued: h.queued,
        sending: h.sending,
        sent24h: h.sent24h,
        failed24h: h.failed24h,
      };
    },
  };
}
