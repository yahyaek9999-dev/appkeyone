// Helpers to talk to the whatsapp-web.js microservice from Next.js
import { createHash } from "crypto";
import { bridgeEnabled } from "@/lib/bridge/flags";

const BASE = process.env.WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001";
const SECRET = process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";
const SMART_QUEUE_ENABLED = process.env.WA_SMART_QUEUE_ENABLED !== "0";
// Applied only to sendNow() (see below), not every call() use — start/pair/
// exportData weren't audited for their expected latency, so this stays
// scoped to exactly the path that needed it: a wedged whatsapp-service can
// hang a send indefinitely, and since drainOutgoingQueue processes its batch
// sequentially, one hung send stalls the entire tick for every tenant.
const SEND_CALL_TIMEOUT_MS = Number(process.env.WA_SEND_TIMEOUT_MS) || 25_000;

async function call(path: string, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs, ...rest } = init || {};
  try {
    const res = await fetch(BASE + path, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SECRET,
        ...(rest.headers || {}),
      },
      cache: "no-store",
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: json };
  } catch (e: any) {
    // A timeout throws a DOMException (name "TimeoutError"), not a plain
    // Error — normalize the message so classifyRetryDelayMs's existing
    // "timeout" substring match (lib/messaging/outgoing-queue.ts) still
    // classifies it as a transient, retryable failure rather than falling
    // through to the generic 5-minute retry bucket.
    const message = e?.name === "TimeoutError" ? "timeout" : e?.message || "request_failed";
    return { ok: false, status: 0, data: { error: message } };
  }
}

async function sendNow(userId: string, to: string, text: string) {
  // ---- KEYONE Bridge (Phase 2): additive, flag-gated outbound routing --------
  // With BRIDGE_ENABLED off, this block is skipped entirely and the send path
  // below is byte-identical to before. When on, a bridge-mode tenant's outbound
  // is delivered through its customer-hosted Bridge (via the co-located
  // gateway); every other tenant still falls through to the whatsapp-web.js
  // gateway call unchanged. The transport-router module (and Prisma) is only
  // imported inside this gate, so the default path pays zero cost.
  if (bridgeEnabled()) {
    try {
      const { maybeRouteBridgeSend } = await import("@/lib/bridge/transport-router");
      const routed = await maybeRouteBridgeSend(userId, to, text);
      if (routed) return routed; // bridge-mode tenant — handled by the Bridge
    } catch {
      // A failure to even decide routing must never break normal sends: fall
      // through to the default gateway (only reached for non-bridge tenants
      // anyway, since maybeRouteBridgeSend returns null for them).
    }
  }
  return call(`/sessions/${userId}/send`, {
    method: "POST",
    body: JSON.stringify({ to, text }),
    timeoutMs: SEND_CALL_TIMEOUT_MS,
  });
}

/**
 * Deterministic idempotency key for a logical send: collapses duplicate or
 * retried enqueue calls for the same (userId, recipient, reason, text)
 * within a short time bucket into a single WaMessage row instead of two
 * (e.g. a webhook delivered twice, or a caller retrying after a transient
 * error before the first enqueue was even drained) — without permanently
 * blocking a legitimately identical message sent again later (a new bucket
 * starts every 5 minutes).
 */
function deriveIdempotencyKey(userId: string, to: string, text: string, reason: string): string {
  const bucket = Math.floor(Date.now() / (5 * 60_000));
  return createHash("sha256").update(`${userId}:${to}:${reason}:${bucket}:${text}`).digest("hex");
}

async function enqueueSend(
  userId: string,
  to: string,
  text: string,
  reason: "manual" | "broadcast" | "followup" | "order_update" | "system" = "system",
) {
  if (!SMART_QUEUE_ENABLED) return sendNow(userId, to, text);
  try {
    const { enqueueOutboundText, drainOutgoingQueue } = await import("@/lib/messaging/outgoing-queue");
    const idempotencyKey = deriveIdempotencyKey(userId, to, text, reason);
    const queued = await enqueueOutboundText({ userId, to, text, reason, idempotencyKey });
    if (!queued.queued) {
      return { ok: false, status: 500, data: { error: queued.reason || "queue_failed" } };
    }
    drainOutgoingQueue({ userId, batchSize: 3, perUserLimit: 1 }).catch(() => {});
    return {
      ok: true,
      status: 202,
      data: { queued: true, id: queued.id, dueAt: queued.dueAt?.toISOString?.() },
    };
  } catch (e: any) {
    return { ok: false, status: 500, data: { error: e?.message || "queue_failed" } };
  }
}

export const wa = {
  /**
   * Start a session. `ephemeral: true` asks the service for a TEMPORARY session
   * — the Recovery flow's only way in. Such a session never auto-reconnects, is
   * never restored after a restart, self-destructs on the service TTL and wipes
   * its auth folder on teardown, so it can never become a normal QR connection.
   * The service has accepted this flag since it was written; nothing on that
   * side changes.
   */
  start: (userId: string, opts?: { ephemeral?: boolean }) =>
    call(`/sessions/${userId}/start`, {
      method: "POST",
      body: JSON.stringify({ ephemeral: !!opts?.ephemeral }),
    }),
  status: (userId: string) => call(`/sessions/${userId}/status`),
  pair: (userId: string, phone: string) =>
    call(`/sessions/${userId}/pair`, { method: "POST", body: JSON.stringify({ phone }) }),
  // Centralized outgoing queue. Use sendNow only inside the queue drainer.
  send: enqueueSend,
  sendNow,
  logout: (userId: string) => call(`/sessions/${userId}`, { method: "DELETE" }),
  // ---- Smart QR Pool controls (additive; used by the slot scheduler) ----
  /** Wake a hibernated session on demand (books it into the active pool). */
  wake: (userId: string) => call(`/sessions/${userId}/wake`, { method: "POST" }),
  /** Pool-wide stats (active/hibernated counts) for slot-capacity decisions. */
  stats: () => call(`/sessions/stats`),
  /** Flag a running QR session TEMPORARY — auto-terminates, never reconnects/restores. */
  markEphemeral: (userId: string) => call(`/sessions/${userId}/ephemeral`, { method: "POST" }),
  /**
   * One-time import data export (contacts + recent chat history) from a live
   * session. Read-only; backed by an additive whatsapp-service endpoint. Returns
   * { ok:false } gracefully if the service/endpoint is unavailable.
   */
  exportData: (userId: string, opts?: { chatLimit?: number; msgLimit?: number }) => {
    const q = new URLSearchParams();
    if (opts?.chatLimit) q.set("chatLimit", String(opts.chatLimit));
    if (opts?.msgLimit) q.set("msgLimit", String(opts.msgLimit));
    const qs = q.toString();
    return call(`/sessions/${userId}/export${qs ? "?" + qs : ""}`);
  },
};
