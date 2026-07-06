/**
 * lib/credits/credits.ts — broadcast-credit engine (ledger-first, atomic).
 *
 * Mirrors the prepaid wallet engine (lib/wallet/wallet.ts) but in INTEGER
 * credits, separate from the Meta wallet. BroadcastCreditLedger is the source of
 * truth; BroadcastCreditWallet.balance is a cache. Every mutation appends one
 * ledger row inside one transaction with the balance change; debits use an
 * atomic guarded decrement so credits never go negative; idempotencyKey makes
 * recording replay-safe; reversal uses a deterministic per-entry key.
 */

import { prisma } from "@/lib/db";
import { reversalKey } from "./credits-core";
import { creditFlags } from "./flags";

const INSUFFICIENT = "CREDITS_INSUFFICIENT";

export type CreditKind = "purchase" | "campaign" | "refund" | "adjustment" | "reversal";

export interface CreditWalletRow {
  id: string; userId: string; balance: number; totalPurchased: number; totalSpent: number;
}

export async function getOrCreateCreditWallet(userId: string): Promise<CreditWalletRow> {
  const existing = await prisma.broadcastCreditWallet.findUnique({ where: { userId } });
  if (existing) return existing as CreditWalletRow;
  const created = await prisma.broadcastCreditWallet.create({ data: { userId } });
  const welcome = Math.max(0, creditFlags.welcomeCredits);
  if (welcome > 0) {
    await credit({ userId, kind: "adjustment", amount: welcome, source: "system", reason: "welcome_credits", idempotencyKey: `welcome:${created.id}` }).catch(() => {});
  }
  return (await prisma.broadcastCreditWallet.findUnique({ where: { userId } })) as CreditWalletRow;
}

export interface CreditMutation {
  userId: string; kind: CreditKind; amount: number; source?: string; reason?: string;
  idempotencyKey: string; refId?: string | null; actorId?: string | null; actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}
export interface CreditResult {
  ok: boolean; recorded: boolean; replay: boolean; ledgerId: string | null;
  balanceAfter: number; shortfall: number; reason?: string;
}

function safeJson(v: unknown): string { try { return JSON.stringify(v || {}); } catch { return "{}"; } }

export async function credit(args: CreditMutation): Promise<CreditResult> {
  const amount = Math.max(0, Math.round(args.amount));
  const wallet = await getOrCreateCreditWallet(args.userId);
  if (amount <= 0) return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: wallet.balance, shortfall: 0, reason: "zero_amount" };
  const bumpsPurchase = args.kind === "purchase";
  try {
    const ledgerId = await prisma.$transaction(async (tx) => {
      const led = await tx.broadcastCreditLedger.create({
        data: {
          userId: args.userId, walletId: wallet.id, direction: "credit", kind: args.kind, amount,
          balanceAfter: 0, source: args.source || "system", reason: args.reason || "", refId: args.refId || null,
          idempotencyKey: args.idempotencyKey, actorId: args.actorId || null, actorEmail: args.actorEmail || null, metadata: safeJson(args.metadata),
        },
      });
      await tx.broadcastCreditWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount }, ...(bumpsPurchase ? { totalPurchased: { increment: amount } } : {}) },
      });
      const fresh = await tx.broadcastCreditWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
      await tx.broadcastCreditLedger.update({ where: { id: led.id }, data: { balanceAfter: fresh?.balance || 0 } });
      return led.id;
    });
    const after = (await prisma.broadcastCreditLedger.findUnique({ where: { id: ledgerId }, select: { balanceAfter: true } }))?.balanceAfter || 0;
    return { ok: true, recorded: true, replay: false, ledgerId, balanceAfter: after, shortfall: 0 };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const ex = await prisma.broadcastCreditLedger.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      return { ok: true, recorded: false, replay: true, ledgerId: ex?.id || null, balanceAfter: ex?.balanceAfter || 0, shortfall: 0, reason: "replay" };
    }
    throw e;
  }
}

export async function debit(args: CreditMutation): Promise<CreditResult> {
  const amount = Math.max(0, Math.round(args.amount));
  const wallet = await getOrCreateCreditWallet(args.userId);
  if (amount <= 0) return { ok: true, recorded: false, replay: false, ledgerId: null, balanceAfter: wallet.balance, shortfall: 0, reason: "zero_amount" };
  try {
    const out = await prisma.$transaction(async (tx) => {
      const led = await tx.broadcastCreditLedger.create({
        data: {
          userId: args.userId, walletId: wallet.id, direction: "debit", kind: args.kind, amount,
          balanceAfter: 0, source: args.source || "system", reason: args.reason || "", refId: args.refId || null,
          idempotencyKey: args.idempotencyKey, actorId: args.actorId || null, actorEmail: args.actorEmail || null, metadata: safeJson(args.metadata),
        },
      });
      const res = await tx.broadcastCreditWallet.updateMany({
        where: { id: wallet.id, balance: { gte: amount } },
        data: { balance: { decrement: amount }, totalSpent: { increment: amount } },
      });
      if (res.count !== 1) throw new Error(INSUFFICIENT);
      const fresh = await tx.broadcastCreditWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
      await tx.broadcastCreditLedger.update({ where: { id: led.id }, data: { balanceAfter: fresh?.balance || 0 } });
      return { ledgerId: led.id, balanceAfter: fresh?.balance || 0 };
    });
    return { ok: true, recorded: true, replay: false, ledgerId: out.ledgerId, balanceAfter: out.balanceAfter, shortfall: 0 };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const ex = await prisma.broadcastCreditLedger.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      return { ok: true, recorded: false, replay: true, ledgerId: ex?.id || null, balanceAfter: ex?.balanceAfter || 0, shortfall: 0, reason: "replay" };
    }
    if (e instanceof Error && e.message === INSUFFICIENT) {
      const w = await prisma.broadcastCreditWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
      const bal = w?.balance || 0;
      return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: bal, shortfall: amount - bal, reason: "insufficient_credits" };
    }
    throw e;
  }
}

export async function adjust(args: Omit<CreditMutation, "kind"> & { kind?: CreditKind }): Promise<CreditResult> {
  const signed = Math.round(Number(args.amount) || 0);
  const kind = args.kind || "adjustment";
  if (signed >= 0) return credit({ ...args, kind, amount: signed });
  return debit({ ...args, kind, amount: Math.abs(signed) });
}

/** Refund credits back to a wallet for a specific campaign (idempotent per ref+key). */
export async function refund(args: { userId: string; amount: number; refId: string; reason?: string; idempotencyKey: string }): Promise<CreditResult> {
  return credit({ userId: args.userId, kind: "refund", amount: args.amount, source: "system", reason: args.reason || "campaign_refund", refId: args.refId, idempotencyKey: args.idempotencyKey });
}

export async function reverse(args: { ledgerId: string; reason?: string; actorId?: string | null; actorEmail?: string | null }): Promise<CreditResult> {
  const original = await prisma.broadcastCreditLedger.findUnique({ where: { id: args.ledgerId } });
  if (!original) return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: 0, shortfall: 0, reason: "not_found" };
  const dupe = await prisma.broadcastCreditLedger.findUnique({ where: { reversalOf: original.id } }).catch(() => null);
  if (dupe) return { ok: true, recorded: false, replay: true, ledgerId: dupe.id, balanceAfter: dupe.balanceAfter, shortfall: 0, reason: "already_reversed" };
  const wallet = await getOrCreateCreditWallet(original.userId);
  const reverseAsDebit = original.direction === "credit";
  const amount = original.amount;
  try {
    const out = await prisma.$transaction(async (tx) => {
      const led = await tx.broadcastCreditLedger.create({
        data: {
          userId: original.userId, walletId: wallet.id, direction: reverseAsDebit ? "debit" : "credit", kind: "reversal", amount,
          balanceAfter: 0, source: "system", reason: args.reason || `reverse:${original.kind}`, idempotencyKey: reversalKey(original.id),
          reversalOf: original.id, actorId: args.actorId || null, actorEmail: args.actorEmail || null, metadata: safeJson({ reversalOf: original.id }),
        },
      });
      if (reverseAsDebit) {
        const res = await tx.broadcastCreditWallet.updateMany({ where: { id: wallet.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
        if (res.count !== 1) throw new Error(INSUFFICIENT);
      } else {
        await tx.broadcastCreditWallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
      }
      const fresh = await tx.broadcastCreditWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
      await tx.broadcastCreditLedger.update({ where: { id: led.id }, data: { balanceAfter: fresh?.balance || 0 } });
      return { ledgerId: led.id, balanceAfter: fresh?.balance || 0 };
    });
    return { ok: true, recorded: true, replay: false, ledgerId: out.ledgerId, balanceAfter: out.balanceAfter, shortfall: 0 };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const ex = await prisma.broadcastCreditLedger.findUnique({ where: { reversalOf: original.id } }).catch(() => null);
      return { ok: true, recorded: false, replay: true, ledgerId: ex?.id || null, balanceAfter: ex?.balanceAfter || 0, shortfall: 0, reason: "already_reversed" };
    }
    if (e instanceof Error && e.message === INSUFFICIENT) return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: wallet.balance, shortfall: 0, reason: "insufficient_credits" };
    throw e;
  }
}

export async function reconcileCreditWallet(userId: string): Promise<{ balance: number; drift: number }> {
  const wallet = await getOrCreateCreditWallet(userId);
  const rows = await prisma.broadcastCreditLedger.findMany({ where: { userId }, select: { direction: true, amount: true } });
  let truth = 0;
  for (const r of rows) truth += r.direction === "credit" ? r.amount : -r.amount;
  const drift = truth - wallet.balance;
  if (drift !== 0) await prisma.broadcastCreditWallet.update({ where: { id: wallet.id }, data: { balance: truth } });
  return { balance: truth, drift };
}

export async function listCreditLedger(userId: string, opts: { take?: number; cursor?: string } = {}) {
  const take = Math.min(Math.max(opts.take || 25, 1), 100);
  const rows = await prisma.broadcastCreditLedger.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id || null : null };
}
