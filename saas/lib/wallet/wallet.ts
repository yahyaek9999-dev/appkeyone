/**
 * lib/wallet/wallet.ts — prepaid wallet engine (ledger-first, atomic).
 *
 * Invariants:
 *   - The WalletLedger is the source of truth; `Wallet.balanceUsd` is a cache.
 *   - Every credit/debit appends exactly one ledger row inside ONE interactive
 *     transaction together with the balance change, so they commit or roll back
 *     together (no torn writes).
 *   - Idempotency: `idempotencyKey` is @unique. A replay creates the ledger row
 *     FIRST; the P2002 unique violation rolls the whole transaction back before
 *     the balance is touched, so a charge can never be applied twice.
 *   - A debit uses an atomic guarded decrement (`updateMany WHERE balanceUsd >=
 *     amount`); if the guard fails the transaction rolls back and the caller
 *     keeps the charge as unbilled debt. The balance never goes negative.
 *   - A reversal uses a deterministic per-entry key (`reversal:<id>`) so
 *     reversing the same entry twice is a no-op.
 *
 * This module is imported by new API routes + the meta-cost reconciler ONLY.
 * It is never called from the protected WhatsApp send pipeline.
 */

import { prisma } from "@/lib/db";
import { roundUsd } from "./money";
import { balanceFromLedger, balanceState, reversalKey, type BalanceState } from "./wallet-core";
import { walletFlags } from "./flags";

const INSUFFICIENT = "WALLET_INSUFFICIENT";

export type WalletKind = "topup" | "meta_usage" | "broadcast" | "adjustment" | "refund" | "reversal";

export interface WalletRow {
  id: string;
  userId: string;
  balanceUsd: number;
  currency: string;
  status: string;
  lowBalanceThresholdUsd: number;
  autoSuspendOnZero: boolean;
  totalToppedUpUsd: number;
  totalSpentUsd: number;
  lowBalanceNotifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Create-or-return the tenant wallet, applying default threshold + welcome credit. */
export async function getOrCreateWallet(userId: string): Promise<WalletRow> {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing as unknown as WalletRow;

  const created = await prisma.wallet.create({
    data: {
      userId,
      lowBalanceThresholdUsd: roundUsd(walletFlags.lowBalanceThresholdUsd),
    },
  });
  // Optional welcome credit (default 0 → no-op).
  const welcome = roundUsd(walletFlags.welcomeCreditUsd);
  if (welcome > 0) {
    await credit({
      userId,
      kind: "adjustment",
      amountUsd: welcome,
      source: "system",
      reason: "welcome_credit",
      idempotencyKey: `welcome:${created.id}`,
    }).catch(() => {});
  }
  return (await prisma.wallet.findUnique({ where: { userId } })) as unknown as WalletRow;
}

export interface WalletSummary extends WalletRow {
  state: BalanceState;
}

export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  const w = await getOrCreateWallet(userId);
  return { ...w, state: balanceState(w.balanceUsd, w.lowBalanceThresholdUsd) };
}

export interface MutationArgs {
  userId: string;
  kind: WalletKind;
  amountUsd: number;
  source?: string;
  reason?: string;
  idempotencyKey: string;
  actorId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MutationResult {
  ok: boolean;
  recorded: boolean;
  replay: boolean;
  ledgerId: string | null;
  balanceAfter: number;
  shortfall: number;
  reason?: string;
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v || {}); } catch { return "{}"; }
}

/** Look up an existing ledger row by idempotency key (for replay results). */
async function findByKey(key: string) {
  return prisma.walletLedger.findUnique({ where: { idempotencyKey: key } });
}

/** Add funds. Cannot fail on balance. Idempotent by idempotencyKey. */
export async function credit(args: MutationArgs): Promise<MutationResult> {
  const amount = roundUsd(Math.abs(args.amountUsd));
  if (amount <= 0) {
    const w = await getOrCreateWallet(args.userId);
    return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: w.balanceUsd, shortfall: 0, reason: "zero_amount" };
  }
  const wallet = await getOrCreateWallet(args.userId);
  const bumpsTopup = args.kind === "topup";
  try {
    const ledgerId = await prisma.$transaction(async (tx) => {
      const led = await tx.walletLedger.create({
        data: {
          userId: args.userId,
          walletId: wallet.id,
          direction: "credit",
          kind: args.kind,
          amountUsd: amount,
          balanceAfterUsd: 0,
          source: args.source || "system",
          reason: args.reason || "",
          idempotencyKey: args.idempotencyKey,
          actorId: args.actorId || null,
          actorEmail: args.actorEmail || null,
          metadata: safeJson(args.metadata),
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceUsd: { increment: amount },
          ...(bumpsTopup ? { totalToppedUpUsd: { increment: amount } } : {}),
          // Re-arm low-balance alerting once funds are added.
          lowBalanceNotifiedAt: null,
        },
      });
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id }, select: { balanceUsd: true } });
      const after = roundUsd(fresh?.balanceUsd || 0);
      await tx.walletLedger.update({ where: { id: led.id }, data: { balanceAfterUsd: after } });
      return led.id;
    });
    const after = (await prisma.walletLedger.findUnique({ where: { id: ledgerId }, select: { balanceAfterUsd: true } }))?.balanceAfterUsd || 0;
    return { ok: true, recorded: true, replay: false, ledgerId, balanceAfter: roundUsd(after), shortfall: 0 };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const existing = await findByKey(args.idempotencyKey);
      return { ok: true, recorded: false, replay: true, ledgerId: existing?.id || null, balanceAfter: roundUsd(existing?.balanceAfterUsd || 0), shortfall: 0, reason: "replay" };
    }
    throw e;
  }
}

/**
 * Spend funds. Atomic + never-negative. Returns ok:false with a shortfall when
 * the balance cannot cover the amount (the caller keeps it as unbilled debt).
 * Idempotent by idempotencyKey.
 */
export async function debit(args: MutationArgs): Promise<MutationResult> {
  const amount = roundUsd(Math.abs(args.amountUsd));
  if (amount <= 0) {
    const w = await getOrCreateWallet(args.userId);
    return { ok: true, recorded: false, replay: false, ledgerId: null, balanceAfter: w.balanceUsd, shortfall: 0, reason: "zero_amount" };
  }
  const wallet = await getOrCreateWallet(args.userId);
  try {
    const out = await prisma.$transaction(async (tx) => {
      const led = await tx.walletLedger.create({
        data: {
          userId: args.userId,
          walletId: wallet.id,
          direction: "debit",
          kind: args.kind,
          amountUsd: amount,
          balanceAfterUsd: 0,
          source: args.source || "system",
          reason: args.reason || "",
          idempotencyKey: args.idempotencyKey,
          actorId: args.actorId || null,
          actorEmail: args.actorEmail || null,
          metadata: safeJson(args.metadata),
        },
      });
      // Atomic guarded decrement — only succeeds if funds cover the amount.
      const res = await tx.wallet.updateMany({
        where: { id: wallet.id, balanceUsd: { gte: amount } },
        data: { balanceUsd: { decrement: amount }, totalSpentUsd: { increment: amount } },
      });
      if (res.count !== 1) {
        throw new Error(INSUFFICIENT);
      }
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id }, select: { balanceUsd: true } });
      const after = roundUsd(fresh?.balanceUsd || 0);
      await tx.walletLedger.update({ where: { id: led.id }, data: { balanceAfterUsd: after } });
      return { ledgerId: led.id, balanceAfter: after };
    });
    return { ok: true, recorded: true, replay: false, ledgerId: out.ledgerId, balanceAfter: out.balanceAfter, shortfall: 0 };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const existing = await findByKey(args.idempotencyKey);
      return { ok: true, recorded: false, replay: true, ledgerId: existing?.id || null, balanceAfter: roundUsd(existing?.balanceAfterUsd || 0), shortfall: 0, reason: "replay" };
    }
    if (e instanceof Error && e.message === INSUFFICIENT) {
      const w = await prisma.wallet.findUnique({ where: { id: wallet.id }, select: { balanceUsd: true } });
      const bal = roundUsd(w?.balanceUsd || 0);
      return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: bal, shortfall: roundUsd(amount - bal), reason: "insufficient_funds" };
    }
    throw e;
  }
}

/** Admin manual adjustment — positive amount credits, negative debits. */
export async function adjust(args: Omit<MutationArgs, "kind"> & { kind?: WalletKind }): Promise<MutationResult> {
  const signed = Number(args.amountUsd) || 0;
  const kind = args.kind || "adjustment";
  if (signed >= 0) return credit({ ...args, kind, amountUsd: signed });
  return debit({ ...args, kind, amountUsd: Math.abs(signed) });
}

/**
 * Reverse a prior ledger entry (e.g. refund a wrongly-applied debit, or claw
 * back a credit). Deterministic per-entry key → reversing twice is a no-op.
 */
export async function reverse(args: {
  ledgerId: string;
  reason?: string;
  actorId?: string | null;
  actorEmail?: string | null;
}): Promise<MutationResult> {
  const original = await prisma.walletLedger.findUnique({ where: { id: args.ledgerId } });
  if (!original) {
    return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: 0, shortfall: 0, reason: "not_found" };
  }
  // Already reversed?
  const dupe = await prisma.walletLedger.findUnique({ where: { reversalOf: original.id } }).catch(() => null);
  if (dupe) {
    return { ok: true, recorded: false, replay: true, ledgerId: dupe.id, balanceAfter: roundUsd(dupe.balanceAfterUsd || 0), shortfall: 0, reason: "already_reversed" };
  }
  const amount = roundUsd(original.amountUsd);
  const wallet = await getOrCreateWallet(original.userId);
  // A credit reversal is a debit; a debit reversal is a credit.
  const reverseAsDebit = original.direction === "credit";
  try {
    const out = await prisma.$transaction(async (tx) => {
      const led = await tx.walletLedger.create({
        data: {
          userId: original.userId,
          walletId: wallet.id,
          direction: reverseAsDebit ? "debit" : "credit",
          kind: "reversal",
          amountUsd: amount,
          balanceAfterUsd: 0,
          source: "reconcile",
          reason: args.reason || `reverse:${original.kind}`,
          idempotencyKey: reversalKey(original.id),
          reversalOf: original.id,
          actorId: args.actorId || null,
          actorEmail: args.actorEmail || null,
          metadata: safeJson({ reversalOf: original.id, originalKind: original.kind }),
        },
      });
      if (reverseAsDebit) {
        const res = await tx.wallet.updateMany({
          where: { id: wallet.id, balanceUsd: { gte: amount } },
          data: { balanceUsd: { decrement: amount } },
        });
        if (res.count !== 1) throw new Error(INSUFFICIENT);
      } else {
        await tx.wallet.update({ where: { id: wallet.id }, data: { balanceUsd: { increment: amount } } });
      }
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id }, select: { balanceUsd: true } });
      const after = roundUsd(fresh?.balanceUsd || 0);
      await tx.walletLedger.update({ where: { id: led.id }, data: { balanceAfterUsd: after } });
      return { ledgerId: led.id, balanceAfter: after };
    });
    return { ok: true, recorded: true, replay: false, ledgerId: out.ledgerId, balanceAfter: out.balanceAfter, shortfall: 0 };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const existing = await prisma.walletLedger.findUnique({ where: { reversalOf: original.id } }).catch(() => null);
      return { ok: true, recorded: false, replay: true, ledgerId: existing?.id || null, balanceAfter: roundUsd(existing?.balanceAfterUsd || 0), shortfall: 0, reason: "already_reversed" };
    }
    if (e instanceof Error && e.message === INSUFFICIENT) {
      return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: wallet.balanceUsd, shortfall: 0, reason: "insufficient_funds" };
    }
    throw e;
  }
}

/** Recompute the cached balance from the append-only ledger (ledger wins). */
export async function reconcileWallet(userId: string): Promise<{ balance: number; drift: number }> {
  const wallet = await getOrCreateWallet(userId);
  const rows = await prisma.walletLedger.findMany({ where: { userId }, select: { direction: true, amountUsd: true } });
  const truth = balanceFromLedger(rows as any);
  const drift = roundUsd(truth - wallet.balanceUsd);
  if (Math.abs(drift) > 1e-6) {
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balanceUsd: truth } });
  }
  return { balance: truth, drift };
}

/** Paginated ledger (transactions / history). Newest first. */
export async function listLedger(userId: string, opts: { take?: number; cursor?: string; kind?: string } = {}) {
  const take = Math.min(Math.max(opts.take || 25, 1), 100);
  const where: any = { userId };
  if (opts.kind) where.kind = opts.kind;
  const rows = await prisma.walletLedger.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id || null : null };
}

/**
 * GATED + UNWIRED helper for a future, approved send-pipeline change. Returns
 * whether the wallet currently permits sends. The protected pipeline does NOT
 * call this today; enabling enforcement requires WALLET_ENFORCE_SENDS=1 AND an
 * approved change to wire it in. Fails OPEN when billing/enforcement are off.
 */
export async function walletAllowsSend(userId: string): Promise<{ allowed: boolean; reason?: string; balance: number }> {
  if (!walletFlags.enforceSends || !walletFlags.billingEnabled) {
    return { allowed: true, reason: "enforcement_off", balance: 0 };
  }
  const w = await prisma.wallet.findUnique({ where: { userId }, select: { balanceUsd: true, status: true } }).catch(() => null);
  if (!w) return { allowed: true, reason: "no_wallet", balance: 0 };
  if (w.status === "suspended") return { allowed: false, reason: "wallet_suspended", balance: roundUsd(w.balanceUsd) };
  if (roundUsd(w.balanceUsd) <= 0) return { allowed: false, reason: "empty_balance", balance: 0 };
  return { allowed: true, balance: roundUsd(w.balanceUsd) };
}

export async function setLowBalanceThreshold(userId: string, thresholdUsd: number) {
  const t = roundUsd(Math.max(0, thresholdUsd));
  await getOrCreateWallet(userId);
  return prisma.wallet.update({ where: { userId }, data: { lowBalanceThresholdUsd: t } });
}

export async function setWalletStatus(userId: string, status: "active" | "suspended") {
  await getOrCreateWallet(userId);
  return prisma.wallet.update({ where: { userId }, data: { status } });
}
