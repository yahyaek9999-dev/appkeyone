import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import { bump } from "@/lib/metrics";
import { loadState, logEvent, hashReply, audit } from "@/lib/safety/store";
import { recordFailure } from "@/lib/safety/engine";
import { nextAllowedSendAt, recordSent } from "@/lib/safety/queue";

export type QueueReason =
  | "manual"
  | "broadcast"
  | "followup"
  | "order_update"
  | "system";

export interface EnqueueOutboundTextInput {
  userId: string;
  to: string;
  text: string;
  conversationId?: string | null;
  reason?: QueueReason;
  idempotencyKey?: string | null;
  delayMs?: number;
  provider?: "qr" | "meta_cloud";
}

export interface DrainOptions {
  batchSize?: number;
  perUserLimit?: number;
  now?: Date;
}

export interface DrainResult {
  examined: number;
  sent: number;
  failed: number;
  delayed: number;
  skipped: number;
  claimed: number;
  log: Array<{ id: string; userId: string; status: string; reason?: string }>;
}

const MAX_BATCH = 50;
const DEFAULT_BATCH = 20;
const DEFAULT_PER_USER_LIMIT = 6;
const SEND_TIMEOUT_RETRY_MS = 5 * 60_000;
const RATE_RETRY_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

function errorText(data: unknown): string {
  if (typeof data === "string") return data.slice(0, 500);
  return safeJson(data).slice(0, 500);
}

function classifyRetryDelayMs(reason: string): number {
  const r = reason.toLowerCase();
  if (r.includes("rate") || r.includes("429") || r.includes("too many")) {
    return RATE_RETRY_MS;
  }
  if (r.includes("block") || r.includes("forbidden") || r.includes("not registered")) {
    return 0;
  }
  return SEND_TIMEOUT_RETRY_MS;
}

export async function enqueueOutboundText(
  input: EnqueueOutboundTextInput,
): Promise<{ queued: boolean; id?: string; reason?: string; dueAt?: Date }> {
  const text = String(input.text || "").trim();
  const to = String(input.to || "").trim();
  if (!input.userId || !to || !text) {
    return { queued: false, reason: "missing_required_fields" };
  }

  const basis = Date.now() + Math.max(0, Math.min(7 * 24 * 3_600_000, input.delayMs || 0));
  const dueMs = nextAllowedSendAt(input.userId, to, basis);
  const dueAt = new Date(Math.max(Date.now(), dueMs));

  try {
    const row = await (prisma as any).waMessage.upsert({
      where: input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : { id: "__never__" },
      create: {
        userId: input.userId,
        provider: input.provider || "qr",
        conversationId: input.conversationId || null,
        customerPhone: to,
        direction: "outbound",
        kind: "text",
        body: text.slice(0, 4000),
        status: "queued",
        queuedAt: dueAt,
        idempotencyKey: input.idempotencyKey || null,
        errorDetail: input.reason || "queued",
      },
      update: {
        conversationId: input.conversationId || null,
        body: text.slice(0, 4000),
        status: "queued",
        queuedAt: dueAt,
        errorDetail: input.reason || "requeued",
      },
    });
    bump("wa_queue_enqueued", input.userId);
    return { queued: true, id: row.id, dueAt };
  } catch (e: any) {
    // Prisma cannot upsert without a unique idempotencyKey. Fall back to create
    // for callers that intentionally do not dedupe.
    if (!input.idempotencyKey) {
      try {
        const row = await (prisma as any).waMessage.create({
          data: {
            userId: input.userId,
            provider: input.provider || "qr",
            conversationId: input.conversationId || null,
            customerPhone: to,
            direction: "outbound",
            kind: "text",
            body: text.slice(0, 4000),
            status: "queued",
            queuedAt: dueAt,
            errorDetail: input.reason || "queued",
          },
        });
        bump("wa_queue_enqueued", input.userId);
        return { queued: true, id: row.id, dueAt };
      } catch (inner: any) {
        return { queued: false, reason: inner?.message || "queue_create_failed" };
      }
    }
    return { queued: false, reason: e?.message || "queue_upsert_failed" };
  }
}

export async function drainOutgoingQueue(
  opts: DrainOptions = {},
): Promise<DrainResult> {
  const now = opts.now || new Date();
  const batchSize = Math.max(1, Math.min(MAX_BATCH, opts.batchSize || DEFAULT_BATCH));
  const perUserLimit = Math.max(1, Math.min(20, opts.perUserLimit || DEFAULT_PER_USER_LIMIT));
  const result: DrainResult = {
    examined: 0,
    sent: 0,
    failed: 0,
    delayed: 0,
    skipped: 0,
    claimed: 0,
    log: [],
  };
  const perUserSent = new Map<string, number>();

  const rows = await (prisma as any).waMessage
    .findMany({
      where: {
        direction: "outbound",
        kind: "text",
        status: "queued",
        queuedAt: { lte: now },
      },
      orderBy: [{ queuedAt: "asc" }, { attempts: "asc" }],
      take: batchSize,
    })
    .catch(() => []);

  result.examined = rows.length;

  for (const row of rows as any[]) {
    const userSent = perUserSent.get(row.userId) || 0;
    if (userSent >= perUserLimit) {
      result.skipped++;
      result.log.push({ id: row.id, userId: row.userId, status: "skipped", reason: "per_user_limit" });
      continue;
    }

    const state = await loadState(row.userId).catch(() => null);
    if (state?.killSwitchActive) {
      await delayRow(row.id, new Date(Date.now() + 60 * 60_000), "kill_switch_active");
      result.delayed++;
      result.log.push({ id: row.id, userId: row.userId, status: "delayed", reason: "kill_switch_active" });
      continue;
    }
    if (state?.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now()) {
      await delayRow(row.id, new Date(state.cooldownUntil), "cooldown_active");
      result.delayed++;
      result.log.push({ id: row.id, userId: row.userId, status: "delayed", reason: "cooldown_active" });
      continue;
    }

    const safeAt = nextAllowedSendAt(row.userId, row.customerPhone);
    if (safeAt > Date.now() + 500) {
      await delayRow(row.id, new Date(safeAt), "anti_flood_pacing");
      result.delayed++;
      result.log.push({ id: row.id, userId: row.userId, status: "delayed", reason: "anti_flood_pacing" });
      continue;
    }

    const claim = await (prisma as any).waMessage
      .updateMany({
        where: { id: row.id, status: "queued" },
        data: { status: "sending", attempts: { increment: 1 } },
      })
      .catch(() => ({ count: 0 }));
    if (!claim?.count) {
      result.skipped++;
      continue;
    }
    result.claimed++;

    const sent = await wa.send(row.userId, row.customerPhone, row.body || "");
    if (sent.ok) {
      await (prisma as any).waMessage
        .update({
          where: { id: row.id },
          data: {
            status: "sent",
            sentAt: new Date(),
            errorCode: null,
            errorDetail: null,
            providerMsgId: extractProviderMessageId(sent.data),
          },
        })
        .catch(() => {});
      recordSent(row.userId, row.customerPhone);
      await logEvent(row.userId, "send", {
        phone: row.customerPhone,
        replyHash: hashReply(row.body || ""),
        payload: { source: "outgoing_queue", messageId: row.id },
      }).catch(() => {});
      bump("wa_queue_sent", row.userId);
      result.sent++;
      perUserSent.set(row.userId, userSent + 1);
      result.log.push({ id: row.id, userId: row.userId, status: "sent" });
      continue;
    }

    const reason = errorText(sent.data);
    await recordFailure(row.userId, null, row.customerPhone, reason).catch(() => {});
    const nextDelay = classifyRetryDelayMs(reason);
    const attempts = (row.attempts || 0) + 1;
    if (nextDelay > 0 && attempts < MAX_ATTEMPTS) {
      await (prisma as any).waMessage
        .update({
          where: { id: row.id },
          data: {
            status: "queued",
            queuedAt: new Date(Date.now() + nextDelay),
            errorCode: String(sent.status || "send_failed"),
            errorDetail: reason,
          },
        })
        .catch(() => {});
      bump("wa_queue_retry", row.userId);
      result.delayed++;
      result.log.push({ id: row.id, userId: row.userId, status: "retry", reason });
    } else {
      await (prisma as any).waMessage
        .update({
          where: { id: row.id },
          data: {
            status: "failed",
            failedAt: new Date(),
            errorCode: String(sent.status || "send_failed"),
            errorDetail: reason,
          },
        })
        .catch(() => {});
      await audit("warn", "outgoing_queue", "فشل إرسال رسالة واتساب من الطابور", {
        userId: row.userId,
        detail: reason,
        payload: { messageId: row.id, attempts },
      }).catch(() => {});
      bump("wa_queue_failed", row.userId);
      result.failed++;
      result.log.push({ id: row.id, userId: row.userId, status: "failed", reason });
    }
  }

  if (result.examined > 0) bump("wa_queue_drain", "*", result.examined);
  return result;
}

async function delayRow(id: string, dueAt: Date, reason: string): Promise<void> {
  await (prisma as any).waMessage
    .update({ where: { id }, data: { queuedAt: dueAt, errorDetail: reason } })
    .catch(() => {});
}

function extractProviderMessageId(data: unknown): string | null {
  const d: any = data || {};
  const raw = d.id || d.messageId || d.providerMsgId || d.data?.id || d.data?.messageId;
  return raw ? String(raw).slice(0, 180) : null;
}

export async function getOutgoingQueueHealth(userId?: string): Promise<{
  queued: number;
  scheduled: number;
  sending: number;
  sent24h: number;
  failed24h: number;
  oldestQueuedAgeSec: number;
}> {
  const now = new Date();
  const since = new Date(Date.now() - 24 * 3_600_000);
  const whereUser = userId ? { userId } : {};
  const [queued, scheduled, sending, sent24h, failed24h, oldest] = await Promise.all([
    (prisma as any).waMessage.count({ where: { ...whereUser, status: "queued", queuedAt: { lte: now } } }).catch(() => -1),
    (prisma as any).waMessage.count({ where: { ...whereUser, status: "queued", queuedAt: { gt: now } } }).catch(() => -1),
    (prisma as any).waMessage.count({ where: { ...whereUser, status: "sending" } }).catch(() => -1),
    (prisma as any).waMessage.count({ where: { ...whereUser, status: { in: ["sent", "delivered", "read"] }, sentAt: { gte: since } } }).catch(() => -1),
    (prisma as any).waMessage.count({ where: { ...whereUser, status: "failed", failedAt: { gte: since } } }).catch(() => -1),
    (prisma as any).waMessage.findFirst({
      where: { ...whereUser, status: "queued", queuedAt: { lte: now } },
      orderBy: { queuedAt: "asc" },
      select: { queuedAt: true },
    }).catch(() => null),
  ]);
  const oldestQueuedAgeSec = oldest?.queuedAt
    ? Math.max(0, Math.round((Date.now() - new Date(oldest.queuedAt).getTime()) / 1000))
    : 0;
  return { queued, scheduled, sending, sent24h, failed24h, oldestQueuedAgeSec };
}
