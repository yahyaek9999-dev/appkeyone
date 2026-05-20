import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import type { LimitKind } from "@/lib/membership/limits";

function safeJson(value: unknown): string {
  try { return JSON.stringify(value || {}); } catch { return "{}"; }
}

function fieldFor(kind: LimitKind): string {
  return kind === "messages" ? "msgsUsed" : kind === "ai" ? "aiRequestsUsed" : "broadcastsUsed";
}

export function usageIdempotencyKey(parts: Array<string | number | null | undefined>): string {
  const raw = parts.map((p) => String(p ?? "")).join(":");
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Append-only billing ledger + legacy subscription counter update.
 *
 * The ledger is the source of audit truth and survives chat/customer deletion.
 * The subscription counters remain as the fast quota cache used by existing
 * runtime gates. A duplicate idempotency key never increments counters twice.
 */
export async function recordUsage(args: {
  userId: string;
  kind: LimitKind;
  quantity?: number;
  source: string;
  reason?: string;
  idempotencyKey: string;
  conversationId?: string | null;
  messageId?: string | null;
  customerId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ recorded: boolean }> {
  const quantity = Math.max(1, Math.round(args.quantity || 1));
  const field = fieldFor(args.kind);
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId: args.userId }, select: { id: true } }).catch(() => null);
    await prisma.$transaction([
      (prisma as any).usageLedger.create({
        data: {
          userId: args.userId,
          subscriptionId: sub?.id || null,
          kind: args.kind,
          quantity,
          source: args.source,
          reason: args.reason || "",
          idempotencyKey: args.idempotencyKey,
          conversationId: args.conversationId || null,
          messageId: args.messageId || null,
          customerId: args.customerId || null,
          metadata: safeJson(args.metadata),
        },
      }),
      prisma.subscription.update({
        where: { userId: args.userId },
        data: { [field]: { increment: quantity } } as any,
      }),
    ]);
    return { recorded: true };
  } catch (e: any) {
    // P2002 = idempotency replay; do not increment the cache counter.
    if (String(e?.code || "") === "P2002") return { recorded: false };
    // If the usageLedger table is not migrated yet, fall back to the old safe
    // counter behavior rather than breaking production messaging.
    try {
      await prisma.subscription.update({
        where: { userId: args.userId },
        data: { [field]: { increment: quantity } } as any,
      });
      return { recorded: true };
    } catch {
      return { recorded: false };
    }
  }
}

export async function buildDailyUsageSnapshot(userId: string, day = new Date().toISOString().slice(0, 10)) {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const rows = await (prisma as any).usageLedger.findMany({
    where: { userId, createdAt: { gte: start, lt: end } },
    select: { kind: true, quantity: true, idempotencyKey: true, createdAt: true },
  }).catch(() => []);

  let messages = 0, aiRequests = 0, broadcasts = 0;
  const hash = createHash("sha256");
  for (const r of rows) {
    const q = Number(r.quantity || 0);
    if (r.kind === "messages") messages += q;
    else if (r.kind === "ai") aiRequests += q;
    else if (r.kind === "broadcast") broadcasts += q;
    hash.update(`${r.kind}:${q}:${r.idempotencyKey}:${new Date(r.createdAt).toISOString()}|`);
  }
  const ledgerHash = hash.digest("hex");
  const snap = await (prisma as any).usageDailySnapshot.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, messages, aiRequests, broadcasts, ledgerHash, verified: true },
    update: { messages, aiRequests, broadcasts, ledgerHash, verified: true, mismatch: null },
  }).catch(() => null);
  return snap || { userId, day, messages, aiRequests, broadcasts, ledgerHash, verified: true };
}

export async function verifyUsageAgainstLedger(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } }).catch(() => null) as any;
  if (!sub) return { ok: true, reason: "no_subscription" };
  const resetAt = sub.usageResetAt || sub.startedAt || new Date(0);
  const rows = await (prisma as any).usageLedger.groupBy({
    by: ["kind"],
    where: { userId, createdAt: { gte: resetAt } },
    _sum: { quantity: true },
  }).catch(() => []);
  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = r._sum?.quantity || 0;
  const expected = {
    messages: byKind.messages || 0,
    ai: byKind.ai || 0,
    broadcast: byKind.broadcast || 0,
  };
  const actual = {
    messages: sub.msgsUsed || 0,
    ai: sub.aiRequestsUsed || 0,
    broadcast: sub.broadcastsUsed || 0,
  };
  const ok = expected.messages === actual.messages && expected.ai === actual.ai && expected.broadcast === actual.broadcast;
  if (!ok) {
    await (prisma as any).safetyAudit.create({
      data: {
        userId,
        level: "critical",
        category: "billing",
        title: "Usage counter mismatch",
        detail: "Subscription counters differ from immutable usage ledger.",
        payload: safeJson({ expected, actual, resetAt }),
      },
    }).catch(() => {});
  }
  return { ok, expected, actual, resetAt };
}
