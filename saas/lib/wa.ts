// Helpers to talk to the whatsapp-web.js microservice from Next.js
const BASE = process.env.WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001";
const SECRET = process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";
const SMART_QUEUE_ENABLED = process.env.WA_SMART_QUEUE_ENABLED !== "0";

async function call(path: string, init?: RequestInit) {
  try {
    const res = await fetch(BASE + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SECRET,
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: json };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

async function sendNow(userId: string, to: string, text: string) {
  return call(`/sessions/${userId}/send`, {
    method: "POST",
    body: JSON.stringify({ to, text }),
  });
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
    const queued = await enqueueOutboundText({ userId, to, text, reason });
    if (!queued.queued) {
      return { ok: false, status: 500, data: { error: queued.reason || "queue_failed" } };
    }
    drainOutgoingQueue({ batchSize: 3, perUserLimit: 1 }).catch(() => {});
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
  start: (userId: string) => call(`/sessions/${userId}/start`, { method: "POST" }),
  status: (userId: string) => call(`/sessions/${userId}/status`),
  pair: (userId: string, phone: string) =>
    call(`/sessions/${userId}/pair`, { method: "POST", body: JSON.stringify({ phone }) }),
  // Centralized outgoing queue. Use sendNow only inside the queue drainer.
  send: enqueueSend,
  sendNow,
  logout: (userId: string) => call(`/sessions/${userId}`, { method: "DELETE" }),
};
