// BullMQ-backed queue — planned for Phase 2.
//
// Once ENABLE_BULLMQ=1 is set and Redis/Upstash is configured, this will
// replace the SQLite queue for message delivery. Until then, calling any
// method on this returns a NOT_IMPLEMENTED error.
//
// Implementation notes for Phase 2:
//   - Use the queue names defined in lib/queue.ts (keyone:broadcasts, etc.)
//   - Set concurrency on the Worker based on send pacing (current: 2.5s spacing)
//   - Dead-letter sends that exceed MAX_ATTEMPTS to keyone:dead-letter
//   - Monitor queue depth via BullMQ's getWaitingCount/getActiveCount

import type { QueueMessage, QueueInterface, DrainOptions, DrainResult } from "./index";

export function createBullMqQueue(): QueueInterface {
  return {
    async enqueue(_msg: QueueMessage) {
      // Phase 2: await broadcastQueue.add("send-message", msg, { ... })
      return { queued: false, reason: "bullmq_not_implemented_yet" };
    },

    async drain(_opts?: DrainOptions): Promise<DrainResult> {
      return {
        examined: 0,
        sent: 0,
        failed: 0,
        delayed: 0,
        skipped: 0,
        claimed: 0,
        log: [],
      };
    },

    async health() {
      return { queued: -1, sending: -1, sent24h: -1, failed24h: -1 };
    },
  };
}
