// Admin Finance Control — read/aggregation layer.
//
// This module NEVER implements payment, wallet, or billing logic. It composes
// what already exists:
//   - PaymentTransaction / Invoice / WalletLedger / PaymentProof (Prisma)
//   - lib/payments (getPaymentStats, reconcilePayments)
//   - lib/wallet/money (rounding/formatting)
//   - lib/observability/tenant-costs (real AI cost attribution)
//   - MetaUsageRecord.metaCostUsd (real messaging cost)
//
// Metrics are explicitly labelled ACTUAL vs ESTIMATED. Where the data model has
// no source for a cost (gateway fees, infrastructure), the value is reported as
// `null` and rendered as "Data unavailable" — never fabricated.

import { prisma } from "@/lib/db";
import { roundUsd } from "@/lib/wallet/money";
import { getTenantCosts } from "@/lib/observability/tenant-costs";

// ── Payment listing (server-side filter + pagination) ────────────────────────

export type PaymentFilters = {
  q?: string;              // id / providerRef / providerOrderId / intentRef / tenant email
  status?: string;         // PaymentTransaction.status
  provider?: string;       // gateway/provider
  minUsd?: number;
  maxUsd?: number;
  from?: string;           // ISO date
  to?: string;             // ISO date
  sort?: "createdAt" | "amountUsd";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type PaymentListRow = {
  id: string;
  userId: string;
  tenantEmail: string | null;
  provider: string;
  amountUsd: number;
  currency: string;
  status: string;
  providerRef: string | null;
  ledgerId: string | null;
  failureReason: string | null;
  createdAt: Date;
  reconciledAt: Date | null;
};

export type PaymentListResult = {
  rows: PaymentListRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

const MAX_PAGE_SIZE = 100;

/** Build the Prisma `where` for the payment list. Exported so CSV export and
 *  the list endpoint always filter identically. */
export async function buildPaymentWhere(f: PaymentFilters): Promise<any> {
  const where: any = {};

  if (f.status) where.status = f.status;
  if (f.provider) where.provider = f.provider;

  if (f.minUsd != null || f.maxUsd != null) {
    where.amountUsd = {};
    if (f.minUsd != null) where.amountUsd.gte = f.minUsd;
    if (f.maxUsd != null) where.amountUsd.lte = f.maxUsd;
  }

  if (f.from || f.to) {
    where.createdAt = {};
    if (f.from) where.createdAt.gte = new Date(f.from);
    if (f.to) {
      // inclusive end-of-day
      const to = new Date(f.to);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }

  const q = f.q?.trim();
  if (q) {
    // Tenant lookup is bounded — resolve matching owner ids first so the OR
    // stays index-friendly instead of joining on every row.
    const owners = await prisma.user
      .findMany({
        where: { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
        select: { id: true },
        take: 50,
      })
      .catch(() => [] as { id: string }[]);

    where.OR = [
      { id: q },
      { providerRef: { contains: q, mode: "insensitive" } },
      { providerOrderId: { contains: q, mode: "insensitive" } },
      { intentRef: { contains: q, mode: "insensitive" } },
      ...(owners.length ? [{ userId: { in: owners.map((o) => o.id) } }] : []),
    ];
  }

  return where;
}

/** Parse payment filters from a request URL. Shared by the list + export routes
 *  so both always apply identical filtering. */
export function parsePaymentFilters(url: URL): PaymentFilters {
  const p = url.searchParams;
  const num = (k: string) => {
    const v = p.get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    q: p.get("q") || undefined,
    status: p.get("status") || undefined,
    provider: p.get("provider") || undefined,
    minUsd: num("minUsd"),
    maxUsd: num("maxUsd"),
    from: p.get("from") || undefined,
    to: p.get("to") || undefined,
    sort: p.get("sort") === "amountUsd" ? "amountUsd" : "createdAt",
    dir: p.get("dir") === "asc" ? "asc" : "desc",
    page: num("page") ?? 1,
    pageSize: num("pageSize") ?? 25,
  };
}

export async function listPayments(f: PaymentFilters): Promise<PaymentListResult> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, f.pageSize ?? 25));
  const where = await buildPaymentWhere(f);
  const orderBy = { [f.sort ?? "createdAt"]: f.dir ?? "desc" } as any;

  const [rows, total] = await Promise.all([
    prisma.paymentTransaction
      .findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, userId: true, provider: true, amountUsd: true, currency: true,
          status: true, providerRef: true, ledgerId: true, failureReason: true,
          createdAt: true, reconciledAt: true,
        },
      })
      .catch(() => [] as any[]),
    prisma.paymentTransaction.count({ where }).catch(() => 0),
  ]);

  const emails = await resolveTenantEmails(rows.map((r: any) => r.userId));

  return {
    rows: rows.map((r: any) => ({ ...r, tenantEmail: emails.get(r.userId) ?? null })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function resolveTenantEmails(userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds));
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }).catch(() => []);
  return new Map(users.map((u) => [u.id, u.email]));
}

// ── Payment detail (real relationships only) ─────────────────────────────────

export type PaymentDetail = {
  payment: any;
  tenant: { id: string; email: string; name: string | null } | null;
  subscription: { status: string; planName: string; expiresAt: Date } | null;
  ledger: { id: string; direction: string; kind: string; amountUsd: number; balanceAfterUsd: number; reason: string; createdAt: Date } | null;
  invoice: { id: string; number: string; amountUsd: number; issuedAt: Date } | null;
  topupRequest: { id: string; status: string; method: string; amountUsd: number } | null;
  /** Refund/reversal ledger entries that reference this payment's ledger. */
  refunds: { id: string; kind: string; amountUsd: number; reason: string; createdAt: Date }[];
};

export async function getPaymentDetail(id: string): Promise<PaymentDetail | null> {
  const payment = await prisma.paymentTransaction.findUnique({ where: { id } }).catch(() => null);
  if (!payment) return null;

  const [tenant, sub, ledger, invoice, topup] = await Promise.all([
    prisma.user.findUnique({ where: { id: payment.userId }, select: { id: true, email: true, name: true } }).catch(() => null),
    prisma.subscription
      .findUnique({ where: { userId: payment.userId }, include: { plan: { select: { name: true } } } })
      .catch(() => null),
    payment.ledgerId
      ? (prisma as any).walletLedger
          .findUnique({
            where: { id: payment.ledgerId },
            select: { id: true, direction: true, kind: true, amountUsd: true, balanceAfterUsd: true, reason: true, createdAt: true },
          })
          .catch(() => null)
      : null,
    (prisma as any).invoice
      ?.findUnique({ where: { paymentTransactionId: payment.id }, select: { id: true, number: true, amountUsd: true, issuedAt: true } })
      .catch(() => null) ?? null,
    payment.topupRequestId
      ? (prisma as any).walletTopupRequest
          .findUnique({ where: { id: payment.topupRequestId }, select: { id: true, status: true, method: true, amountUsd: true } })
          .catch(() => null)
      : null,
  ]);

  // Refund/reversal entries linked to this payment's ledger entry.
  const refunds = payment.ledgerId
    ? await (prisma as any).walletLedger
        .findMany({
          where: { userId: payment.userId, kind: { in: ["refund", "reversal"] }, reversalOf: payment.ledgerId },
          select: { id: true, kind: true, amountUsd: true, reason: true, createdAt: true },
          take: 10,
        })
        .catch(() => [])
    : [];

  return {
    payment,
    tenant,
    subscription: sub ? { status: sub.status, planName: (sub as any).plan?.name ?? "—", expiresAt: sub.expiresAt } : null,
    ledger,
    invoice,
    topupRequest: topup,
    refunds,
  };
}

// ── Gateway health (real signals only) ───────────────────────────────────────

export type GatewayHealthState = "healthy" | "degraded" | "failing" | "unverified" | "disabled" | "no_data";

export type GatewayRow = {
  id: string;
  name: string;
  displayName: string;
  adapter: string;
  status: string;
  isDefault: boolean;
  testMode: boolean;
  /** SAFE metadata only — never the credential values themselves. */
  credentialsConfigured: boolean;
  webhookConfigured: boolean;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  // Derived from real PaymentTransaction rows for this adapter.
  recentTotal: number;
  recentPaid: number;
  recentFailed: number;
  successRatePct: number | null; // null = not enough data
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  health: GatewayHealthState;
};

const MIN_TX_FOR_RATE = 5; // below this we report "not enough data" rather than a misleading %

export async function getGatewayHealth(days = 30): Promise<GatewayRow[]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const gateways = await (prisma as any).paymentGateway
    ?.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
    .catch(() => []) ?? [];

  const out: GatewayRow[] = [];

  for (const g of gateways) {
    // Adapter maps to PaymentTransaction.provider.
    const [total, paid, failed, lastSuccess, lastFailure] = await Promise.all([
      prisma.paymentTransaction.count({ where: { provider: g.adapter, createdAt: { gte: since } } }).catch(() => 0),
      prisma.paymentTransaction.count({ where: { provider: g.adapter, status: { in: ["paid", "reconciled"] }, createdAt: { gte: since } } }).catch(() => 0),
      prisma.paymentTransaction.count({ where: { provider: g.adapter, status: "failed", createdAt: { gte: since } } }).catch(() => 0),
      prisma.paymentTransaction
        .findFirst({ where: { provider: g.adapter, status: { in: ["paid", "reconciled"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
        .catch(() => null),
      prisma.paymentTransaction
        .findFirst({ where: { provider: g.adapter, status: "failed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
        .catch(() => null),
    ]);

    const decided = paid + failed;
    const successRatePct = decided >= MIN_TX_FOR_RATE ? Math.round((paid / decided) * 100) : null;

    let health: GatewayHealthState;
    if (g.status === "inactive") health = "disabled";
    else if (successRatePct == null) health = g.lastTestOk === true ? "unverified" : g.lastTestOk === false ? "failing" : "no_data";
    else if (successRatePct >= 90) health = "healthy";
    else if (successRatePct >= 60) health = "degraded";
    else health = "failing";

    out.push({
      id: g.id,
      name: g.name,
      displayName: g.displayName || g.name,
      adapter: g.adapter,
      status: g.status,
      isDefault: !!g.isDefault,
      testMode: !!g.testMode,
      credentialsConfigured: !!g.credentialsEnc,
      webhookConfigured: !!(g.webhookSecretEnc || g.webhookSecret),
      lastTestAt: g.lastTestAt ?? null,
      lastTestOk: g.lastTestOk ?? null,
      lastError: g.lastError ?? null,
      recentTotal: total,
      recentPaid: paid,
      recentFailed: failed,
      successRatePct,
      lastSuccessAt: lastSuccess?.createdAt ?? null,
      lastFailureAt: lastFailure?.createdAt ?? null,
      health,
    });
  }

  return out;
}

// ── Revenue summary (explicitly labelled) ────────────────────────────────────

export type RevenueSummary = {
  days: number;
  /** ACTUAL — sum of paid/reconciled PaymentTransaction rows in window. */
  grossPaidUsd: number;
  paidCount: number;
  /** ACTUAL — refund/reversal ledger entries in window. */
  refundsUsd: number;
  refundCount: number;
  /** ACTUAL — sum of PromotionRedemption.discountApplied (cents → USD) in window. */
  discountsUsd: number;
  /** DERIVED — grossPaid − refunds. Discounts are already reflected in the
   *  charged amount, so they are reported separately and NOT subtracted twice. */
  netCollectedUsd: number;
  pendingUsd: number;
  pendingCount: number;
  failedCount: number;
};

export async function getRevenueSummary(days = 30): Promise<RevenueSummary> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [paidAgg, pendingAgg, failedCount, refundAgg, discountAgg] = await Promise.all([
    prisma.paymentTransaction
      .aggregate({ where: { status: { in: ["paid", "reconciled"] }, createdAt: { gte: since } }, _sum: { amountUsd: true }, _count: true })
      .catch(() => ({ _sum: { amountUsd: null }, _count: 0 }) as any),
    prisma.paymentTransaction
      .aggregate({ where: { status: { in: ["created", "pending"] }, createdAt: { gte: since } }, _sum: { amountUsd: true }, _count: true })
      .catch(() => ({ _sum: { amountUsd: null }, _count: 0 }) as any),
    prisma.paymentTransaction.count({ where: { status: "failed", createdAt: { gte: since } } }).catch(() => 0),
    (prisma as any).walletLedger
      ?.aggregate({ where: { kind: { in: ["refund", "reversal"] }, createdAt: { gte: since } }, _sum: { amountUsd: true }, _count: true })
      .catch(() => ({ _sum: { amountUsd: null }, _count: 0 })) ?? { _sum: { amountUsd: null }, _count: 0 },
    (prisma as any).promotionRedemption
      ?.aggregate({ where: { appliedAt: { gte: since } }, _sum: { discountApplied: true } })
      .catch(() => ({ _sum: { discountApplied: null } })) ?? { _sum: { discountApplied: null } },
  ]);

  const grossPaidUsd = roundUsd(paidAgg._sum?.amountUsd ?? 0);
  const refundsUsd = roundUsd(refundAgg._sum?.amountUsd ?? 0);

  return {
    days,
    grossPaidUsd,
    paidCount: paidAgg._count ?? 0,
    refundsUsd,
    refundCount: refundAgg._count ?? 0,
    discountsUsd: roundUsd((discountAgg._sum?.discountApplied ?? 0) / 100),
    netCollectedUsd: roundUsd(grossPaidUsd - refundsUsd),
    pendingUsd: roundUsd(pendingAgg._sum?.amountUsd ?? 0),
    pendingCount: pendingAgg._count ?? 0,
    failedCount,
  };
}

// ── Plan economics (real data; explicit nulls where no source exists) ────────

export type PlanEconomicsRow = {
  slug: string;
  name: string;
  priceUsd: number;
  activeSubs: number;
  /** ACTUAL — MRR from active subscriptions at list price. */
  mrrUsd: number;
  /** ACTUAL — payments collected from this plan's subscribers in window. */
  collectedUsd: number;
  paymentCount: number;
  /** ACTUAL — promotion discounts redeemed by this plan's subscribers. */
  discountUsd: number;
  /** ACTUAL — Meta messaging cost (MetaUsageRecord.metaCostUsd) for subscribers. */
  messagingCostUsd: number;
  /** ESTIMATED — provider-priced AI cost from lib/observability/tenant-costs. */
  aiCostUsd: number;
  /** No data source in the model — always null, rendered "Data unavailable". */
  gatewayFeesUsd: null;
  infrastructureCostUsd: null;
  /** DERIVED — collected − (messaging + AI). Excludes gateway/infra (unavailable). */
  partialMarginUsd: number;
  partialMarginPct: number | null;
};

export type PlanEconomics = {
  days: number;
  rows: PlanEconomicsRow[];
  /** True when KEYONE_PROVIDER_PRICES_JSON is set (AI pricing is configured, not default). */
  aiPricesConfigured: boolean;
  note: string;
};

export async function getPlanEconomics(days = 30): Promise<PlanEconomics> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [plans, subs, costs] = await Promise.all([
    prisma.plan.findMany({ where: { status: "active" }, select: { slug: true, name: true, priceUsd: true, yearlyUsd: true } }).catch(() => []),
    prisma.subscription
      .findMany({ where: { status: "active" }, select: { userId: true, planId: true, billingCycle: true, plan: { select: { slug: true } } } })
      .catch(() => []),
    getTenantCosts({ days }).catch(() => null),
  ]);

  // planSlug → userIds
  const bySlug = new Map<string, string[]>();
  for (const s of subs as any[]) {
    const slug = s.plan?.slug;
    if (!slug) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(s.userId);
  }

  // userId → estimated AI cost (from the canonical tenant-costs aggregator)
  const aiByUser = new Map<string, number>();
  for (const r of costs?.rows ?? []) aiByUser.set(r.userId, r.estUsd);

  const rows: PlanEconomicsRow[] = [];

  for (const p of plans as any[]) {
    const userIds = bySlug.get(p.slug) ?? [];
    const activeSubs = userIds.length;

    const [payAgg, discAgg, metaAgg] = await Promise.all([
      userIds.length
        ? prisma.paymentTransaction
            .aggregate({ where: { userId: { in: userIds }, status: { in: ["paid", "reconciled"] }, createdAt: { gte: since } }, _sum: { amountUsd: true }, _count: true })
            .catch(() => ({ _sum: { amountUsd: null }, _count: 0 }) as any)
        : ({ _sum: { amountUsd: null }, _count: 0 } as any),
      userIds.length
        ? (prisma as any).promotionRedemption
            ?.aggregate({ where: { userId: { in: userIds }, appliedAt: { gte: since } }, _sum: { discountApplied: true } })
            .catch(() => ({ _sum: { discountApplied: null } })) ?? { _sum: { discountApplied: null } }
        : { _sum: { discountApplied: null } },
      userIds.length
        ? (prisma as any).metaUsageRecord
            ?.aggregate({ where: { userId: { in: userIds }, createdAt: { gte: since } }, _sum: { metaCostUsd: true } })
            .catch(() => ({ _sum: { metaCostUsd: null } })) ?? { _sum: { metaCostUsd: null } }
        : { _sum: { metaCostUsd: null } },
    ]);

    const collectedUsd = roundUsd(payAgg._sum?.amountUsd ?? 0);
    const messagingCostUsd = roundUsd(metaAgg._sum?.metaCostUsd ?? 0);
    const aiCostUsd = roundUsd(userIds.reduce((sum, uid) => sum + (aiByUser.get(uid) ?? 0), 0));
    const partialMarginUsd = roundUsd(collectedUsd - messagingCostUsd - aiCostUsd);

    rows.push({
      slug: p.slug,
      name: p.name,
      priceUsd: p.priceUsd,
      activeSubs,
      mrrUsd: roundUsd(activeSubs * p.priceUsd),
      collectedUsd,
      paymentCount: payAgg._count ?? 0,
      discountUsd: roundUsd((discAgg._sum?.discountApplied ?? 0) / 100),
      messagingCostUsd,
      aiCostUsd,
      gatewayFeesUsd: null,
      infrastructureCostUsd: null,
      partialMarginUsd,
      partialMarginPct: collectedUsd > 0 ? Math.round((partialMarginUsd / collectedUsd) * 100) : null,
    });
  }

  rows.sort((a, b) => b.mrrUsd - a.mrrUsd);

  return {
    days,
    rows,
    aiPricesConfigured: !!costs?.pricesConfigured,
    note: "الهامش جزئي: يخصم تكلفة الرسائل (فعلية) وتكلفة الذكاء (تقديرية) فقط. رسوم البوابات والبنية التحتية غير متوفرة في نموذج البيانات.",
  };
}

// ── Promotion financial impact (existing engine, read-only) ──────────────────

export type PromotionImpactRow = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  status: string;
  usedCount: number;
  usageLimit: number | null;
  redemptions: number;
  discountUsd: number;
  customers: number;
  endsAt: Date | null;
  targetPlans: string[];
};

export async function getPromotionImpact(): Promise<PromotionImpactRow[]> {
  const promos = await (prisma as any).promotion
    ?.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
    .catch(() => []) ?? [];
  if (!promos.length) return [];

  const grouped = await (prisma as any).promotionRedemption
    ?.groupBy({ by: ["promoId"], _sum: { discountApplied: true }, _count: { _all: true } })
    .catch(() => []) ?? [];

  const byPromo = new Map<string, { sum: number; count: number }>();
  for (const g of grouped as any[]) {
    byPromo.set(g.promoId, { sum: g._sum?.discountApplied ?? 0, count: g._count?._all ?? 0 });
  }

  return (promos as any[]).map((p) => {
    const agg = byPromo.get(p.id) ?? { sum: 0, count: 0 };
    let targetPlans: string[] = [];
    try { targetPlans = JSON.parse(p.targetPlans || "[]"); } catch {}
    return {
      id: p.id,
      name: p.name,
      code: p.code ?? null,
      type: p.type,
      status: p.status,
      usedCount: p.usedCount ?? 0,
      usageLimit: p.usageLimit ?? null,
      redemptions: agg.count,
      discountUsd: roundUsd(agg.sum / 100),
      customers: agg.count, // PromotionRedemption is unique per (promo, user)
      endsAt: p.endsAt ?? null,
      targetPlans,
    };
  });
}

// ── Invoices (read-only admin visibility over the existing model) ────────────

export type InvoiceFilters = { q?: string; from?: string; to?: string; page?: number; pageSize?: number };

export async function listInvoices(f: InvoiceFilters) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, f.pageSize ?? 25));

  const where: any = {};
  if (f.from || f.to) {
    where.issuedAt = {};
    if (f.from) where.issuedAt.gte = new Date(f.from);
    if (f.to) { const to = new Date(f.to); to.setHours(23, 59, 59, 999); where.issuedAt.lte = to; }
  }
  const q = f.q?.trim();
  if (q) {
    const owners = await prisma.user
      .findMany({ where: { email: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 50 })
      .catch(() => [] as { id: string }[]);
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      ...(owners.length ? [{ userId: { in: owners.map((o) => o.id) } }] : []),
    ];
  }

  const [rows, total] = await Promise.all([
    (prisma as any).invoice
      ?.findMany({ where, orderBy: { issuedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })
      .catch(() => []) ?? [],
    (prisma as any).invoice?.count({ where }).catch(() => 0) ?? 0,
  ]);

  const emails = await resolveTenantEmails((rows as any[]).map((r) => r.userId));

  return {
    rows: (rows as any[]).map((r) => ({ ...r, tenantEmail: emails.get(r.userId) ?? null })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
