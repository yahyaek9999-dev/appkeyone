/**
 * lib/brain/credits.ts — Brain-credit engine (ledger-first, atomic, idempotent).
 *
 * Mirrors the proven broadcast-credit engine (lib/credits/credits.ts) exactly,
 * but on BrainCreditWallet/BrainCreditLedger. BrainCreditLedger is the source of
 * truth; BrainCreditWallet.balance is a cache. Every mutation appends one ledger
 * row inside one transaction with the balance change; debits use an atomic
 * guarded decrement so credits never go negative; idempotencyKey makes recording
 * replay-safe; reversal uses a deterministic per-entry key.
 */
import { prisma } from "@/lib/db";
import { brainFlags } from "./flags";

const INSUFFICIENT = "BRAIN_CREDITS_INSUFFICIENT";

export type BrainCreditKind = "monthly" | "usage" | "purchase" | "refund" | "adjustment" | "reversal";

export interface BrainWalletRow {
  id: string; userId: string; balance: number; totalPurchased: number; totalSpent: number;
}

export async function getOrCreateBrainWallet(userId: string): Promise<BrainWalletRow> {
  const existing = await prisma.brainCreditWallet.findUnique({ where: { userId } });
  if (existing) return existing as BrainWalletRow;
  let created;
  try {
    created = await prisma.brainCreditWallet.create({ data: { userId } });
  } catch (e: any) {
    // Lost a concurrent first-create race — return the winner's row instead
    // of surfacing a transient 500.
    if (e?.code === "P2002") {
      return (await prisma.brainCreditWallet.findUnique({ where: { userId } })) as BrainWalletRow;
    }
    throw e;
  }
  const welcome = Math.max(0, brainFlags.welcomeCredits);
  if (welcome > 0) {
    await credit({ userId, kind: "adjustment", amount: welcome, source: "system", reason: "welcome_credits", idempotencyKey: `brain-welcome:${created.id}` }).catch(() => {});
  }
  return (await prisma.brainCreditWallet.findUnique({ where: { userId } })) as BrainWalletRow;
}

export interface BrainCreditMutation {
  userId: string; kind: BrainCreditKind; amount: number; source?: string; reason?: string;
  idempotencyKey: string; refId?: string | null; actorId?: string | null; actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}
export interface BrainCreditResult {
  ok: boolean; recorded: boolean; replay: boolean; ledgerId: string | null;
  balanceAfter: number; shortfall: number; reason?: string;
}

function safeJson(v: unknown): string { try { return JSON.stringify(v || {}); } catch { return "{}"; } }

export async function credit(args: BrainCreditMutation): Promise<BrainCreditResult> {
  const amount = Math.max(0, Math.round(args.amount));
  const wallet = await getOrCreateBrainWallet(args.userId);
  if (amount <= 0) return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: wallet.balance, shortfall: 0, reason: "zero_amount" };
  const bumpsPurchase = args.kind === "purchase";
  try {
    const ledgerId = await prisma.$transaction(async (tx) => {
      const led = await tx.brainCreditLedger.create({
        data: {
          userId: args.userId, walletId: wallet.id, direction: "credit", kind: args.kind, amount,
          balanceAfter: 0, source: args.source || "system", reason: args.reason || "", refId: args.refId || null,
          idempotencyKey: args.idempotencyKey, actorId: args.actorId || null, actorEmail: args.actorEmail || null, metadata: safeJson(args.metadata),
        },
      });
      await tx.brainCreditWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount }, ...(bumpsPurchase ? { totalPurchased: { increment: amount } } : {}) },
      });
      const fresh = await tx.brainCreditWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
      await tx.brainCreditLedger.update({ where: { id: led.id }, data: { balanceAfter: fresh?.balance || 0 } });
      return led.id;
    });
    const after = (await prisma.brainCreditLedger.findUnique({ where: { id: ledgerId }, select: { balanceAfter: true } }))?.balanceAfter || 0;
    return { ok: true, recorded: true, replay: false, ledgerId, balanceAfter: after, shortfall: 0 };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const ex = await prisma.brainCreditLedger.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      return { ok: true, recorded: false, replay: true, ledgerId: ex?.id || null, balanceAfter: ex?.balanceAfter || 0, shortfall: 0, reason: "replay" };
    }
    throw e;
  }
}

export async function debit(args: BrainCreditMutation): Promise<BrainCreditResult> {
  const amount = Math.max(0, Math.round(args.amount));
  const wallet = await getOrCreateBrainWallet(args.userId);
  if (amount <= 0) return { ok: true, recorded: false, replay: false, ledgerId: null, balanceAfter: wallet.balance, shortfall: 0, reason: "zero_amount" };
  try {
    const out = await prisma.$transaction(async (tx) => {
      const led = await tx.brainCreditLedger.create({
        data: {
          userId: args.userId, walletId: wallet.id, direction: "debit", kind: args.kind, amount,
          balanceAfter: 0, source: args.source || "system", reason: args.reason || "", refId: args.refId || null,
          idempotencyKey: args.idempotencyKey, actorId: args.actorId || null, actorEmail: args.actorEmail || null, metadata: safeJson(args.metadata),
        },
      });
      const res = await tx.brainCreditWallet.updateMany({
        where: { id: wallet.id, balance: { gte: amount } },
        data: { balance: { decrement: amount }, totalSpent: { increment: amount } },
      });
      if (res.count !== 1) throw new Error(INSUFFICIENT);
      const fresh = await tx.brainCreditWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
      await tx.brainCreditLedger.update({ where: { id: led.id }, data: { balanceAfter: fresh?.balance || 0 } });
      return { ledgerId: led.id, balanceAfter: fresh?.balance || 0 };
    });
    return { ok: true, recorded: true, replay: false, ledgerId: out.ledgerId, balanceAfter: out.balanceAfter, shortfall: 0 };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const ex = await prisma.brainCreditLedger.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      return { ok: true, recorded: false, replay: true, ledgerId: ex?.id || null, balanceAfter: ex?.balanceAfter || 0, shortfall: 0, reason: "replay" };
    }
    if (e instanceof Error && e.message === INSUFFICIENT) {
      const w = await prisma.brainCreditWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
      const bal = w?.balance || 0;
      return { ok: false, recorded: false, replay: false, ledgerId: null, balanceAfter: bal, shortfall: amount - bal, reason: "insufficient_credits" };
    }
    throw e;
  }
}

export async function adjust(args: Omit<BrainCreditMutation, "kind"> & { kind?: BrainCreditKind }): Promise<BrainCreditResult> {
  const signed = Math.round(Number(args.amount) || 0);
  const kind = args.kind || "adjustment";
  if (signed >= 0) return credit({ ...args, kind, amount: signed });
  return debit({ ...args, kind, amount: Math.abs(signed) });
}

export async function reconcileBrainWallet(userId: string): Promise<{ balance: number; drift: number }> {
  const wallet = await getOrCreateBrainWallet(userId);
  const rows = await prisma.brainCreditLedger.findMany({ where: { userId }, select: { direction: true, amount: true } });
  let truth = 0;
  for (const r of rows) truth += r.direction === "credit" ? r.amount : -r.amount;
  const drift = truth - wallet.balance;
  if (drift !== 0) await prisma.brainCreditWallet.update({ where: { id: wallet.id }, data: { balance: truth } });
  return { balance: truth, drift };
}

export async function listBrainLedger(userId: string, opts: { take?: number; cursor?: string } = {}) {
  const take = Math.min(Math.max(opts.take || 25, 1), 100);
  const rows = await prisma.brainCreditLedger.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id || null : null };
}
