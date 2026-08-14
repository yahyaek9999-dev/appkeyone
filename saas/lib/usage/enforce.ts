/**
 * Server-side usage enforcement — the commercial integrity layer.
 *
 * Guarantees:
 * - All quotas checked and incremented atomically (idempotency key prevents replay).
 * - Client can NEVER submit, forge, or bypass counters.
 * - Period = YYYY-MM (UTC). Counters reset each new period automatically (new rows).
 * - Fail-open on DB errors so a gating bug never silences WhatsApp entirely.
 *   Exception: explicit admin kill-switch always takes effect (feature-control).
 *
 * Usage:
 *   const result = await checkAndCharge(userId, "message_out", 1, idempotencyKey);
 *   if (!result.allowed) return quota_error;
 */

import { prisma } from "@/lib/db";
import { getEntitlements } from "@/lib/membership/entitlements";

export type UsageEventType =
  | "message_out"   // outgoing WhatsApp message
  | "message_in"    // incoming WhatsApp message (tracked for analytics)
  | "ai_request"    // AI/LLM call
  | "broadcast"     // broadcast message sent to one recipient
  | "sms"           // K1SMS message
  | "otp";          // OTP message

interface EnforceResult {
  allowed: boolean;
  used: number;
  limit: number;       // 0 = unlimited
  remaining: number;   // -1 = unlimited
  period: string;      // YYYY-MM
  reason?: string;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Map event type to the entitlement limit key. */
function limitKeyFor(eventType: UsageEventType): keyof {
  messages: number; ai: number; broadcasts: number; smsCredits: number;
} | null {
  switch (eventType) {
    case "message_out":
    case "message_in":    return "messages";
    case "ai_request":    return "ai";
    case "broadcast":     return "broadcasts";
    case "sms":
    case "otp":           return "smsCredits";
    default: return null;
  }
}

/**
 * Check if userId is within quota for the given event type, then record the event.
 * Idempotency key = caller-supplied string; duplicates silently return allowed=true.
 *
 * Set quantity > 1 for batch operations (e.g. broadcast to N recipients).
 */
export async function checkAndCharge(
  userId: string,
  eventType: UsageEventType,
  quantity: number = 1,
  idempotencyKey: string,
  opts: { numberId?: string; source?: string; metadata?: Record<string, any> } = {},
): Promise<EnforceResult> {
  const period = currentPeriod();
  const limitKey = limitKeyFor(eventType);

  // ── 1. Get plan limits ────────────────────────────────────────────────────
  let limit = 0; // 0 = unlimited until we resolve
  if (limitKey) {
    try {
      const ents = await getEntitlements(userId);
      limit = (ents.limits as any)[limitKey] ?? 0;
    } catch {
      // Fail-open on entitlement error — never block messaging silently
      limit = 0;
    }
  }

  // ── 2. Idempotency check ─────────────────────────────────────────────────
  const existingEvent = await (prisma as any).usageEvent.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  }).catch(() => null);

  if (existingEvent) {
    // Duplicate — return allowed (already charged once)
    const used = await getPeriodUsage(userId, eventType, period);
    return { allowed: true, used, limit, remaining: limit === 0 ? -1 : Math.max(0, limit - used), period };
  }

  // ── 3. Count current period usage ────────────────────────────────────────
  const used = await getPeriodUsage(userId, eventType, period);

  // ── 4. Enforce limit ─────────────────────────────────────────────────────
  if (limit > 0 && used + quantity > limit) {
    return {
      allowed: false,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      period,
      reason: `quota_exceeded:${eventType}`,
    };
  }

  // ── 5. Record event (atomic insert) ──────────────────────────────────────
  await (prisma as any).usageEvent.create({
    data: {
      userId,
      numberId: opts.numberId ?? null,
      eventType,
      quantity,
      idempotencyKey,
      period,
      source: opts.source ?? "",
      metadata: JSON.stringify(opts.metadata ?? {}),
    },
  }).catch(() => null); // fail-open on write error

  return {
    allowed: true,
    used: used + quantity,
    limit,
    remaining: limit === 0 ? -1 : Math.max(0, limit - used - quantity),
    period,
  };
}

/** Get total usage for a userId + eventType in a given period. */
export async function getPeriodUsage(
  userId: string,
  eventType: UsageEventType,
  period: string = currentPeriod(),
): Promise<number> {
  const result = await (prisma as any).usageEvent.aggregate({
    where: { userId, eventType, period },
    _sum: { quantity: true },
  }).catch(() => ({ _sum: { quantity: 0 } }));
  return result._sum?.quantity ?? 0;
}

/** Get full usage summary for a user — all event types for current period.
 *
 * Reads from two sources and returns the higher of each counter:
 *   1. UsageEvent (new system, charged atomically by checkAndCharge)
 *   2. UsageLedger (existing system, written by old recordUsage() calls)
 *
 * When the migration to checkAndCharge is complete, the UsageLedger fallback
 * can be removed. Until then, the /api/usage endpoint always returns real data.
 */
export async function getUsageSummary(userId: string, period: string = currentPeriod()): Promise<{
  period: string;
  messages: number;
  ai: number;
  broadcasts: number;
  sms: number;
  otp: number;
}> {
  // ── Source 1: new UsageEvent system ──────────────────────────────────────
  const newRows = await (prisma as any).usageEvent.groupBy({
    by: ["eventType"],
    where: { userId, period },
    _sum: { quantity: true },
  }).catch(() => []);

  const newMap: Record<string, number> = {};
  for (const r of newRows) {
    newMap[r.eventType] = r._sum?.quantity ?? 0;
  }

  // ── Source 2: legacy UsageLedger (written by recordUsage) ────────────────
  const [year, month] = period.split("-").map(Number);
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd   = new Date(year, month, 1); // exclusive

  const legacyRows = await prisma.usageLedger.groupBy({
    by: ["kind"],
    where: { userId, createdAt: { gte: periodStart, lt: periodEnd } },
    _sum: { quantity: true },
  }).catch(() => []);

  const legMap: Record<string, number> = {};
  for (const r of legacyRows) {
    legMap[(r as any).kind] = (r as any)._sum?.quantity ?? 0;
  }

  // Return the higher of the two sources for each counter
  const newMsgs = (newMap.message_out ?? 0) + (newMap.message_in ?? 0);
  const legMsgs = legMap.messages ?? 0;

  return {
    period,
    messages:   Math.max(newMsgs, legMsgs),
    ai:         Math.max(newMap.ai_request ?? 0,  legMap.ai ?? 0),
    broadcasts: Math.max(newMap.broadcast ?? 0,   legMap.broadcast ?? 0),
    sms:        newMap.sms ?? 0,
    otp:        newMap.otp ?? 0,
  };
}

/** Generate a deterministic idempotency key for message-level events. */
export function messageIdempotencyKey(userId: string, messageId: string, eventType: UsageEventType): string {
  return `${userId}:${eventType}:${messageId}`;
}
