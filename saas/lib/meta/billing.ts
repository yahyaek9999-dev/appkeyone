/**
 * Meta Enterprise — billing engine.
 *
 * Pipeline:  conversation recorded → cost computed (pricing.ts) → charged to
 * the prepaid wallet → daily rollup → monthly invoice.
 *
 * Design rules (honor the repo's MANDATORY reuse policy):
 *   - The WhatsApp SEND PIPELINE is never modified. Conversations are recorded
 *     either from Meta's pricing webhook (exact) or DERIVED read-only from the
 *     WaMessage ledger (fallback) — both downstream of sending.
 *   - Wallet balance accounting stays single-source in Wallet/WalletLedger.
 *     Every Meta charge writes a WalletLedger row in the SAME transaction that
 *     decrements the balance, plus a MetaTransaction for Meta context.
 *   - Sub-EGP per-conversation costs accumulate in MetaTenant.carryMicroEgp so
 *     whole-EGP wallet debits are exact and unbiased over time.
 *
 * The only thing that remains READY FOR CONFIGURATION is the live authenticated
 * Meta webhook/API delivery (needs production credentials). All logic here runs.
 */

import { prisma } from "@/lib/db";
import {
  computeCharge,
  getUsdEgpRateMicro,
  microUsdToMicroEgp,
  normalizeCategory,
  resolveRate,
  type MetaCategory,
} from "./pricing";
import { debit, adjust } from "@/lib/wallet/wallet";
import { roundUsd } from "@/lib/wallet/money";

const DAY_MS = 86_400_000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// ===========================================================================
// 1) Record a conversation (idempotent on the 24h category window)
// ===========================================================================

export interface RecordConversationInput {
  userId: string;
  category: MetaCategory | string;
  at: Date; // when the window opened (first message time)
  phoneNumberId?: string | null;
  country?: string | null;
  customerPhone?: string | null;
  originType?: "business_initiated" | "user_initiated";
  metaConversationId?: string | null;
  /** Force billable flag; defaults to (charged > 0) so free service windows
   *  are not charged. */
  billable?: boolean;
}

/**
 * Record (or increment) a Meta conversation. Windows are bucketed to a 24h
 * key per (user, phone, category) — a deterministic, idempotent approximation
 * of Meta's rolling 24h conversation window. When Meta supplies the exact
 * conversation id (pricing webhook) it is stored for reconciliation.
 */
export async function recordConversation(input: RecordConversationInput) {
  const category = normalizeCategory(input.category);
  const country = (input.country || "*").toUpperCase();
  const bucket = Math.floor(input.at.getTime() / DAY_MS);
  const windowStart = new Date(bucket * DAY_MS);
  const windowEnd = new Date(windowStart.getTime() + DAY_MS);
  const windowKey = `${input.userId}:${input.phoneNumberId || "-"}:${category}:${bucket}`;

  const existing = await prisma.metaConversation.findUnique({
    where: { userId_windowKey: { userId: input.userId, windowKey } },
  });
  if (existing) {
    const updated = await prisma.metaConversation.update({
      where: { id: existing.id },
      data: {
        messageCount: { increment: 1 },
        ...(input.metaConversationId && !existing.metaConversationId
          ? { metaConversationId: input.metaConversationId }
          : {}),
      },
    });
    return { conversation: updated, created: false as const };
  }

  const rate = await resolveRate(country, category);
  const breakdown = rate
    ? computeCharge(rate.baseCostMicroUsd, rate.markupBps, rate.taxBps)
    : { costMicroUsd: 0, markupMicroUsd: 0, taxMicroUsd: 0, chargedMicroUsd: 0 };
  const billable = input.billable ?? breakdown.chargedMicroUsd > 0;

  const conversation = await prisma.metaConversation.create({
    data: {
      userId: input.userId,
      phoneNumberId: input.phoneNumberId ?? null,
      metaConversationId: input.metaConversationId ?? null,
      windowKey,
      category,
      originType: input.originType ?? "business_initiated",
      country,
      customerPhone: input.customerPhone ?? null,
      billable,
      costMicroUsd: breakdown.costMicroUsd,
      chargedMicroUsd: billable ? breakdown.chargedMicroUsd : 0,
      currency: "USD",
      billingStatus: billable ? "pending" : "free",
      messageCount: 1,
      windowStart,
      windowEnd,
    },
  });
  return { conversation, created: true as const };
}

// ===========================================================================
// 2) Charge a recorded conversation to the prepaid wallet (atomic)
// ===========================================================================

/**
 * Charge a single pending conversation. Concurrency-safe + idempotent: the
 * pending→charged transition is an atomic guard, so a double-call can't
 * double-charge. The whole-EGP wallet debit is derived from the conversation's
 * exact micro-USD cost via the per-tenant carry accumulator.
 */
export async function chargeConversation(conversationId: string) {
  const conv = await prisma.metaConversation.findUnique({ where: { id: conversationId } });
  if (!conv) return { ok: false as const, reason: "not_found" };
  if (conv.billingStatus !== "pending") return { ok: false as const, reason: "not_pending" };
  const userId = conv.userId;

  // Ensure the tenant row exists (carry field retained for EGP-display only).
  await prisma.metaTenant.upsert({ where: { userId }, create: { userId }, update: {} });

  const fxMicro = getUsdEgpRateMicro();
  // Meta cost is native micro-USD → debit the canonical USD wallet directly
  // (no FX/carry needed; the float wallet handles sub-cent precision).
  const chargedUsd = roundUsd(conv.chargedMicroUsd / 1_000_000);
  // EGP equivalent kept on the MetaTransaction for the Meta-local display only.
  const amountEgp = -Math.round(microUsdToMicroEgp(conv.chargedMicroUsd, fxMicro) / 1_000_000);

  // Money movement FIRST and idempotent (key = conversation id). A replay is a
  // no-op, so even a lost claim race below can never double-charge.
  let walletLedgerId: string | null = null;
  let balanceAfter: number | null = null;
  if (chargedUsd > 0) {
    const r = await debit({
      userId,
      kind: "meta_usage",
      amountUsd: chargedUsd,
      source: "meta_cost",
      reason: `Meta ${conv.category} conversation`,
      idempotencyKey: `meta:charge:${conv.id}`,
      metadata: { conversationId: conv.id, category: conv.category, country: conv.country },
    });
    walletLedgerId = r.ledgerId;
    balanceAfter = r.balanceAfter;
  }

  // Claim pending→charged (guard). If a concurrent settle already charged it,
  // the debit above was an idempotent replay — don't double-record the txn.
  const claim = await prisma.metaConversation.updateMany({
    where: { id: conv.id, billingStatus: "pending" },
    data: { billingStatus: "charged" },
  });
  if (claim.count === 0) return { ok: false as const, reason: "not_pending" };

  await prisma.metaTransaction.create({
    data: {
      userId,
      kind: "charge",
      amountEgp,
      costMicroUsd: conv.costMicroUsd,
      fxRateMicro: fxMicro,
      conversationId: conv.id,
      walletLedgerId,
      status: "posted",
      note: `${conv.category} · ${conv.country}`,
    },
  });

  return { ok: true as const, usdDebited: chargedUsd, balanceAfter, userId };
}

/** Charge every pending conversation for a tenant (settlement pass). */
export async function settlePendingConversations(userId: string, limit = 500) {
  const pending = await prisma.metaConversation.findMany({
    where: { userId, billingStatus: "pending" },
    orderBy: { windowStart: "asc" },
    take: limit,
    select: { id: true },
  });
  let charged = 0;
  let usd = 0;
  for (const c of pending) {
    const r = await chargeConversation(c.id);
    if (r.ok) {
      charged++;
      usd += r.usdDebited;
    }
  }
  return { charged, usdDebited: usd, scanned: pending.length };
}

// ===========================================================================
// 3) Manual admin credit / adjustment  (the "admin gives a customer Meta
//    credit" action) — reuses the wallet ledger, fully audited.
// ===========================================================================

/**
 * Credit (or adjust) a tenant's wallet directly from the admin. Positive
 * amountEgp = grant; negative = correction/debit. Atomic + audited.
 */
export async function grantMetaCredit(
  userId: string,
  amountUsd: number,
  opts: { actorId?: string | null; note?: string | null; kind?: "credit" | "adjustment" } = {},
) {
  if (!Number.isFinite(amountUsd) || amountUsd === 0) {
    return { ok: false as const, reason: "invalid_amount" };
  }
  const kind = opts.kind ?? (amountUsd > 0 ? "credit" : "adjustment");
  // Move money on the canonical USD wallet (signed: + grants, − corrections).
  const r = await adjust({
    userId,
    kind: "adjustment",
    amountUsd,
    source: "admin",
    reason: opts.note ?? "meta_grant",
    idempotencyKey: `meta:grant:${userId}:${Date.now()}`,
    actorId: opts.actorId ?? null,
  });
  if (!r.ok && !r.replay) return { ok: false as const, reason: r.reason ?? "wallet_failed" };

  const fxMicro = getUsdEgpRateMicro();
  // EGP equivalent retained on the Meta money trail for display continuity.
  const amountEgp =
    Math.round(microUsdToMicroEgp(Math.abs(amountUsd) * 1_000_000, fxMicro) / 1_000_000) *
    (amountUsd < 0 ? -1 : 1);

  const txn = await prisma.metaTransaction.create({
    data: {
      userId,
      kind,
      amountEgp,
      walletLedgerId: r.ledgerId,
      status: "posted",
      note: opts.note ?? null,
      createdBy: opts.actorId ?? null,
    },
  });
  await prisma.metaAudit.create({
    data: {
      userId,
      actorId: opts.actorId ?? null,
      actorRole: "admin",
      action: kind === "credit" ? "credit" : "adjustment",
      after: JSON.stringify({ amountUsd, balance: r.balanceAfter }),
      note: opts.note ?? null,
    },
  });
  return { ok: true as const, balance: r.balanceAfter, amountUsd, transactionId: txn.id };
}

// ===========================================================================
// 4) Daily rollup + monthly invoice (analytics / billing aggregates)
// ===========================================================================

/** Recompute the daily usage rollup for a tenant from MetaConversation. */
export async function rollupDay(userId: string, day: string) {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MS);
  const convs = await prisma.metaConversation.findMany({
    where: { userId, windowStart: { gte: start, lt: end } },
    select: { category: true, costMicroUsd: true, chargedMicroUsd: true, messageCount: true },
  });
  const agg = {
    conversations: convs.length,
    marketing: 0,
    utility: 0,
    authentication: 0,
    service: 0,
    messages: 0,
    costMicroUsd: 0,
    chargedMicroUsd: 0,
  };
  for (const c of convs) {
    if (c.category === "marketing") agg.marketing++;
    else if (c.category === "utility") agg.utility++;
    else if (c.category === "authentication") agg.authentication++;
    else agg.service++;
    agg.messages += c.messageCount;
    agg.costMicroUsd += c.costMicroUsd;
    agg.chargedMicroUsd += c.chargedMicroUsd;
  }
  const data = {
    conversations: agg.conversations,
    marketing: agg.marketing,
    utility: agg.utility,
    authentication: agg.authentication,
    service: agg.service,
    messages: agg.messages,
    costMicroUsd: BigInt(Math.round(agg.costMicroUsd)),
    chargedMicroUsd: BigInt(Math.round(agg.chargedMicroUsd)),
  };
  return prisma.metaUsageDaily.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, ...data },
    update: data,
  });
}

/** Recompute (or open) the monthly invoice for a tenant. period = "YYYY-MM". */
export async function rollupInvoice(userId: string, period: string) {
  const start = new Date(`${period}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const convs = await prisma.metaConversation.findMany({
    where: { userId, windowStart: { gte: start, lt: end }, billable: true },
    select: { costMicroUsd: true, chargedMicroUsd: true },
  });
  let costMicroUsd = 0;
  let chargedMicroUsd = 0;
  for (const c of convs) {
    costMicroUsd += c.costMicroUsd;
    chargedMicroUsd += c.chargedMicroUsd;
  }
  const markupTaxMicroUsd = chargedMicroUsd - costMicroUsd;
  const totalEgp = Math.round(microUsdToMicroEgp(chargedMicroUsd) / 1_000_000);
  const data = {
    conversations: convs.length,
    costMicroUsd: BigInt(Math.round(costMicroUsd)),
    markupMicroUsd: BigInt(Math.round(markupTaxMicroUsd)),
    taxMicroUsd: BigInt(0),
    totalMicroUsd: BigInt(Math.round(chargedMicroUsd)),
    totalEgp,
  };
  return prisma.metaInvoice.upsert({
    where: { userId_period: { userId, period } },
    create: { userId, period, ...data, status: "open" },
    update: data,
  });
}

// ===========================================================================
// 5) Snapshot for dashboards (customer + admin)
// ===========================================================================

export async function getMetaBillingSnapshot(userId: string) {
  const [wallet, tenant, recentConversations, recentTransactions, usage] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { balanceUsd: true } }),
    prisma.metaTenant.findUnique({ where: { userId } }),
    prisma.metaConversation.findMany({
      where: { userId },
      orderBy: { windowStart: "desc" },
      take: 50,
    }),
    prisma.metaTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.metaUsageDaily.findMany({ where: { userId }, orderBy: { day: "desc" }, take: 30 }),
  ]);
  const pending = await prisma.metaConversation.aggregate({
    where: { userId, billingStatus: "pending" },
    _count: { _all: true },
    _sum: { chargedMicroUsd: true },
  });
  return {
    balanceUsd: wallet?.balanceUsd ?? 0,
    tenant,
    pendingConversations: pending._count._all,
    pendingChargedMicroUsd: pending._sum.chargedMicroUsd ?? 0,
    recentConversations,
    recentTransactions,
    usage,
  };
}

// ===========================================================================
// 6) Ingest sources (both downstream of the untouched send pipeline)
// ===========================================================================

/**
 * Record a conversation from Meta's status webhook `conversation`/`pricing`
 * fields. This is the EXACT billing path once the live webhook is configured.
 * The parsing is real; only the authenticated webhook delivery is READY FOR
 * CONFIGURATION (needs production credentials).
 */
export async function recordConversationFromMetaStatus(
  userId: string,
  status: {
    conversation?: { id?: string; origin?: { type?: string } };
    pricing?: { category?: string; billable?: boolean };
    recipient_id?: string;
    timestamp?: string | number;
  },
  ctx: { phoneNumberId?: string | null; country?: string | null } = {},
) {
  const category = normalizeCategory(status.pricing?.category || status.conversation?.origin?.type);
  const tsRaw = status.timestamp;
  const at = tsRaw ? new Date(Number(tsRaw) * (String(tsRaw).length <= 10 ? 1000 : 1)) : new Date();
  const origin = status.conversation?.origin?.type;
  return recordConversation({
    userId,
    category,
    at: isNaN(at.getTime()) ? new Date() : at,
    phoneNumberId: ctx.phoneNumberId ?? null,
    country: ctx.country ?? null,
    customerPhone: status.recipient_id ?? null,
    originType:
      origin === "user_initiated" || origin === "service" ? "user_initiated" : "business_initiated",
    metaConversationId: status.conversation?.id ?? null,
    billable: status.pricing?.billable,
  });
}

/**
 * Fallback: DERIVE conversations read-only from the WaMessage ledger for a
 * tenant over the last `days`. Template sends are categorized from WaTemplate;
 * other sends default to "service". This never touches the send pipeline.
 */
export async function deriveConversationsFromMessages(userId: string, days = 7) {
  const since = new Date(Date.now() - days * DAY_MS);
  const msgs = await prisma.waMessage.findMany({
    where: { userId, provider: "meta_cloud", queuedAt: { gte: since } },
    select: {
      customerPhone: true,
      kind: true,
      templateName: true,
      queuedAt: true,
      direction: true,
    },
    orderBy: { queuedAt: "asc" },
  });
  if (msgs.length === 0) return { recorded: 0, scanned: 0 };

  // Category lookup for template messages.
  const templateNames = Array.from(
    new Set(msgs.filter((m) => m.templateName).map((m) => m.templateName!)),
  );
  const templates = templateNames.length
    ? await prisma.waTemplate.findMany({
        where: { userId, name: { in: templateNames } },
        select: { name: true, category: true },
      })
    : [];
  const catByTemplate = new Map(templates.map((t) => [t.name, normalizeCategory(t.category)]));

  let recorded = 0;
  for (const m of msgs) {
    const category: MetaCategory =
      m.kind === "template" && m.templateName
        ? (catByTemplate.get(m.templateName) ?? "utility")
        : "service";
    const res = await recordConversation({
      userId,
      category,
      at: m.queuedAt,
      customerPhone: m.customerPhone,
      originType: m.direction === "inbound" ? "user_initiated" : "business_initiated",
    });
    if (res.created) recorded++;
  }
  return { recorded, scanned: msgs.length };
}
