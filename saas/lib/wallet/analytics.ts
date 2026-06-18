/**
 * lib/wallet/analytics.ts — read-only wallet + Meta billing analytics.
 *
 * Powers the admin Wallet/Meta super-center and the per-tenant wallet view.
 * Pure aggregation over Wallet / WalletLedger / MetaUsageRecord — no mutations.
 * All money is USD (Float, micro-dollar precision).
 */

import { prisma } from "@/lib/db";
import { roundUsd } from "./money";
import { META_CATEGORIES, type MetaCategory } from "./meta-rates";

function sinceDate(days: number): Date {
  return new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
}

export interface CategoryBreakdownRow {
  category: MetaCategory;
  conversations: number;
  messages: number;
  charged: number;   // billed to tenants (costUsd)
  metaCost: number;  // KEYONE's cost
  profit: number;
}

export interface TenantWalletRow {
  userId: string;
  email: string;
  name: string | null;
  balanceUsd: number;
  status: string;
  totalToppedUpUsd: number;
  totalSpentUsd: number;
  conversations: number;
  messages: number;
  metaCharged: number;
  metaCost: number;
  profit: number;
}

export interface WalletPlatformStats {
  sinceDay: string;
  days: number;
  totals: {
    walletCount: number;
    totalBalanceUsd: number;
    totalToppedUpUsd: number;   // lifetime credits
    totalSpentUsd: number;      // lifetime debits
    periodTopupsUsd: number;    // credits (topup) in window
    periodDebitsUsd: number;    // all debits in window
    metaConversations: number;
    metaMessages: number;
    metaCharged: number;        // billed to tenants for Meta (window)
    metaCost: number;           // KEYONE's Meta cost (window)
    metaProfit: number;         // metaCharged − metaCost
    costPerCustomerUsd: number;
    costPerMessageUsd: number;
    costPerConversationUsd: number;
    activeTenants: number;      // tenants with Meta usage in window
    pendingTopups: number;
    unbilledConversations: number;
    unbilledUsd: number;
  };
  byCategory: CategoryBreakdownRow[];
  rows: TenantWalletRow[];
  topCustomers: TenantWalletRow[];
}

export async function getWalletPlatformStats({ days = 30 }: { days?: number } = {}): Promise<WalletPlatformStats> {
  const since = sinceDate(days);
  const sinceDay = since.toISOString().slice(0, 10);

  // ── Wallets ───────────────────────────────────────────────────────────────
  const walletAgg = await prisma.wallet.aggregate({
    _sum: { balanceUsd: true, totalToppedUpUsd: true, totalSpentUsd: true },
    _count: { _all: true },
  }).catch(() => null);

  // ── Window ledger flows ─────────────────────────────────────────────────────
  const ledgerByDir = await prisma.walletLedger.groupBy({
    by: ["direction", "kind"],
    where: { createdAt: { gte: since } },
    _sum: { amountUsd: true },
  }).catch(() => [] as any[]);
  let periodTopupsUsd = 0, periodDebitsUsd = 0;
  for (const r of ledgerByDir) {
    const amt = roundUsd(r._sum?.amountUsd || 0);
    if (r.direction === "credit" && r.kind === "topup") periodTopupsUsd += amt;
    if (r.direction === "debit") periodDebitsUsd += amt;
  }

  // ── Meta usage (windowed on the conversation date) ─────────────────────────
  const metaByCat = await prisma.metaUsageRecord.groupBy({
    by: ["category"],
    where: { windowStart: { gte: since } },
    _sum: { costUsd: true, metaCostUsd: true, messageCount: true },
    _count: { _all: true },
  }).catch(() => [] as any[]);

  const catMap = new Map<string, CategoryBreakdownRow>();
  for (const c of META_CATEGORIES) catMap.set(c, { category: c, conversations: 0, messages: 0, charged: 0, metaCost: 0, profit: 0 });
  let metaConversations = 0, metaMessages = 0, metaCharged = 0, metaCost = 0;
  for (const r of metaByCat) {
    const charged = roundUsd(r._sum?.costUsd || 0);
    const mc = roundUsd(r._sum?.metaCostUsd || 0);
    const msgs = Number(r._sum?.messageCount || 0);
    const convs = Number(r._count?._all || 0);
    metaConversations += convs; metaMessages += msgs; metaCharged += charged; metaCost += mc;
    catMap.set(r.category, { category: r.category as MetaCategory, conversations: convs, messages: msgs, charged, metaCost: mc, profit: roundUsd(charged - mc) });
  }

  // ── Per-tenant Meta usage ───────────────────────────────────────────────────
  const metaByTenant = await prisma.metaUsageRecord.groupBy({
    by: ["userId"],
    where: { windowStart: { gte: since } },
    _sum: { costUsd: true, metaCostUsd: true, messageCount: true },
    _count: { _all: true },
  }).catch(() => [] as any[]);

  const wallets = await prisma.wallet.findMany({
    select: { userId: true, balanceUsd: true, status: true, totalToppedUpUsd: true, totalSpentUsd: true },
  }).catch(() => []);
  const walletByUser = new Map(wallets.map((w) => [w.userId, w]));

  const userIds = Array.from(new Set([...metaByTenant.map((r: any) => r.userId), ...wallets.map((w) => w.userId)]));
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } }).catch(() => [])
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const metaByUser = new Map(metaByTenant.map((r: any) => [r.userId, r]));

  const rows: TenantWalletRow[] = userIds.map((uid) => {
    const w = walletByUser.get(uid);
    const m: any = metaByUser.get(uid);
    const charged = roundUsd(m?._sum?.costUsd || 0);
    const mc = roundUsd(m?._sum?.metaCostUsd || 0);
    const u = userById.get(uid);
    return {
      userId: uid,
      email: u?.email || "—",
      name: u?.name || null,
      balanceUsd: roundUsd(w?.balanceUsd || 0),
      status: w?.status || "—",
      totalToppedUpUsd: roundUsd(w?.totalToppedUpUsd || 0),
      totalSpentUsd: roundUsd(w?.totalSpentUsd || 0),
      conversations: Number(m?._count?._all || 0),
      messages: Number(m?._sum?.messageCount || 0),
      metaCharged: charged,
      metaCost: mc,
      profit: roundUsd(charged - mc),
    };
  }).sort((a, b) => b.metaCharged - a.metaCharged || b.balanceUsd - a.balanceUsd);

  // ── Unbilled (debt) + pending top-ups ───────────────────────────────────────
  const unbilledAgg = await prisma.metaUsageRecord.aggregate({
    where: { billed: false, costUsd: { gt: 0 } },
    _sum: { costUsd: true },
    _count: { _all: true },
  }).catch(() => null);
  const pendingTopups = await prisma.walletTopupRequest.count({ where: { status: "pending" } }).catch(() => 0);

  const activeTenants = metaByTenant.length;
  const costPerCustomerUsd = activeTenants > 0 ? roundUsd(metaCost / activeTenants) : 0;
  const costPerMessageUsd = metaMessages > 0 ? roundUsd(metaCost / metaMessages) : 0;
  const costPerConversationUsd = metaConversations > 0 ? roundUsd(metaCost / metaConversations) : 0;

  return {
    sinceDay,
    days,
    totals: {
      walletCount: walletAgg?._count?._all || 0,
      totalBalanceUsd: roundUsd(walletAgg?._sum?.balanceUsd || 0),
      totalToppedUpUsd: roundUsd(walletAgg?._sum?.totalToppedUpUsd || 0),
      totalSpentUsd: roundUsd(walletAgg?._sum?.totalSpentUsd || 0),
      periodTopupsUsd: roundUsd(periodTopupsUsd),
      periodDebitsUsd: roundUsd(periodDebitsUsd),
      metaConversations,
      metaMessages,
      metaCharged: roundUsd(metaCharged),
      metaCost: roundUsd(metaCost),
      metaProfit: roundUsd(metaCharged - metaCost),
      costPerCustomerUsd,
      costPerMessageUsd,
      costPerConversationUsd,
      activeTenants,
      pendingTopups,
      unbilledConversations: Number(unbilledAgg?._count?._all || 0),
      unbilledUsd: roundUsd(unbilledAgg?._sum?.costUsd || 0),
    },
    byCategory: META_CATEGORIES.map((c) => catMap.get(c)!),
    rows,
    topCustomers: rows.slice(0, 10),
  };
}

export interface TenantMetaBreakdown {
  sinceDay: string;
  days: number;
  conversations: number;
  messages: number;
  charged: number;
  byCategory: CategoryBreakdownRow[];
  recent: Array<{
    id: string;
    customerPhone: string;
    category: string;
    country: string;
    messageCount: number;
    costUsd: number;
    billed: boolean;
    windowStart: Date;
  }>;
}

/** Per-tenant Meta usage breakdown for the customer wallet dashboard. */
export async function getTenantMetaBreakdown(userId: string, { days = 30 }: { days?: number } = {}): Promise<TenantMetaBreakdown> {
  const since = sinceDate(days);
  const byCat = await prisma.metaUsageRecord.groupBy({
    by: ["category"],
    where: { userId, windowStart: { gte: since } },
    _sum: { costUsd: true, metaCostUsd: true, messageCount: true },
    _count: { _all: true },
  }).catch(() => [] as any[]);

  const catMap = new Map<string, CategoryBreakdownRow>();
  for (const c of META_CATEGORIES) catMap.set(c, { category: c, conversations: 0, messages: 0, charged: 0, metaCost: 0, profit: 0 });
  let conversations = 0, messages = 0, charged = 0;
  for (const r of byCat) {
    const ch = roundUsd(r._sum?.costUsd || 0);
    const msgs = Number(r._sum?.messageCount || 0);
    const convs = Number(r._count?._all || 0);
    conversations += convs; messages += msgs; charged += ch;
    catMap.set(r.category, { category: r.category as MetaCategory, conversations: convs, messages: msgs, charged: ch, metaCost: roundUsd(r._sum?.metaCostUsd || 0), profit: 0 });
  }

  const recent = await prisma.metaUsageRecord.findMany({
    where: { userId, windowStart: { gte: since } },
    orderBy: { windowStart: "desc" },
    take: 50,
    select: { id: true, customerPhone: true, category: true, country: true, messageCount: true, costUsd: true, billed: true, windowStart: true },
  }).catch(() => []);

  return {
    sinceDay: since.toISOString().slice(0, 10),
    days,
    conversations,
    messages,
    charged: roundUsd(charged),
    byCategory: META_CATEGORIES.map((c) => catMap.get(c)!),
    recent,
  };
}
