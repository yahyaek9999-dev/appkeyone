// Product affinity / cross-sell matrix (Agent 3, Task #9).
//
// Computes "customers who bought X also bought Y" pairs from OrderItem history,
// per merchant, and persists them to the append-only ProductAffinity table.
// This turns the upsell suggestion from a generic best-seller into a SPECIFIC,
// data-driven complement.
//
// Algorithm (classic market-basket, bounded):
//   1. Pull recent non-canceled orders for the merchant (windowed + capped).
//   2. Group OrderItems by orderId → each order is a "basket" of item keys.
//   3. For every unordered pair (a,b) co-occurring in a basket, increment
//      coCount[a][b] and coCount[b][a]. Track per-item support (basket count).
//   4. confidence(a→b) = round(100 * coCount(a,b) / support(a)).
//   5. Keep the top-K complements per anchor above a min support/confidence
//      and upsert them. Stale rows for the merchant are pruned by computedAt.
//
// Item identity: SKU when the OrderItem carries one ("SKU: ..." note), else the
// normalized item name. Sizes/colors are stripped so "قميص أزرق M" and
// "قميص أزرق L" collapse to the same product for affinity purposes.
//
// Pure read of Orders/OrderItems + write to ProductAffinity ONLY. Never touches
// the send pipeline, queue, or order records.

import { prisma } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;

export interface AffinityBatchResult {
  merchantsExamined: number;
  ordersExamined: number;
  pairsWritten: number;
  log: Array<{ userId: string; baskets: number; pairs: number }>;
}

/** Normalize an item to a stable affinity key + display label. */
function itemIdentity(item: { name: string; notes?: string | null }): { key: string; label: string } {
  const note = String(item.notes || "");
  const skuMatch = note.match(/SKU:\s*([^\s,;]+)/i);
  const label = String(item.name || "").trim().slice(0, 120) || "منتج";
  if (skuMatch && skuMatch[1]) {
    return { key: `sku:${skuMatch[1].toLowerCase()}`, label };
  }
  // Name-based key: lowercase, collapse whitespace, strip common size/color
  // qualifiers so variants of the same product collapse together.
  const key = label
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(xs|s|m|l|xl|xxl|xxxl|سمول|ميديم|لارج|اكس لارج)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { key: `name:${key || label.toLowerCase()}`, label };
}

interface PairConfig {
  windowDays?: number;
  maxOrders?: number;
  minSupport?: number; // anchor must appear in >= this many baskets
  minCoCount?: number; // pair must co-occur >= this many times
  minConfidence?: number; // 0-100
  topKPerAnchor?: number;
}

const DEFAULTS: Required<PairConfig> = {
  windowDays: 180,
  maxOrders: 5000,
  minSupport: 2,
  minCoCount: 2,
  minConfidence: 10,
  topKPerAnchor: 8,
};

/** Compute + persist affinity pairs for ONE merchant. Bounded + idempotent. */
export async function computeAffinityForUser(
  userId: string,
  cfg: PairConfig = {},
  now: Date = new Date(),
): Promise<{ baskets: number; pairs: number }> {
  const c = { ...DEFAULTS, ...cfg };
  const since = new Date(now.getTime() - c.windowDays * DAY);

  const orders = await prisma.order.findMany({
    where: { userId, status: { not: "canceled" }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: c.maxOrders,
    select: { id: true, items: { select: { name: true, notes: true } } },
  }).catch(() => [] as any[]);

  // Build baskets of unique item keys (+ remember a display label per key).
  const labelOf = new Map<string, string>();
  const baskets: string[][] = [];
  for (const o of orders as any[]) {
    const keys = new Set<string>();
    for (const it of o.items || []) {
      const { key, label } = itemIdentity(it);
      keys.add(key);
      if (!labelOf.has(key)) labelOf.set(key, label);
    }
    if (keys.size >= 2) baskets.push(Array.from(keys));
  }

  // Support (per item) + co-occurrence counts (directed, symmetric increments).
  const support = new Map<string, number>();
  const co = new Map<string, Map<string, number>>();
  for (const basket of baskets) {
    for (const k of basket) support.set(k, (support.get(k) || 0) + 1);
    for (let i = 0; i < basket.length; i++) {
      for (let j = i + 1; j < basket.length; j++) {
        const a = basket[i];
        const b = basket[j];
        if (!co.has(a)) co.set(a, new Map());
        if (!co.has(b)) co.set(b, new Map());
        co.get(a)!.set(b, (co.get(a)!.get(b) || 0) + 1);
        co.get(b)!.set(a, (co.get(b)!.get(a) || 0) + 1);
      }
    }
  }

  // Materialize qualifying pairs, top-K per anchor.
  const rows: Array<{
    productKey: string;
    productLabel: string;
    relatedKey: string;
    relatedLabel: string;
    coCount: number;
    support: number;
    confidence: number;
  }> = [];

  for (const [anchor, relateds] of co.entries()) {
    const sup = support.get(anchor) || 0;
    if (sup < c.minSupport) continue;
    const scored = Array.from(relateds.entries())
      .map(([rel, coCount]) => ({
        rel,
        coCount,
        confidence: Math.max(0, Math.min(100, Math.round((coCount / sup) * 100))),
      }))
      .filter((r) => r.coCount >= c.minCoCount && r.confidence >= c.minConfidence)
      .sort((a, b) => b.confidence - a.confidence || b.coCount - a.coCount)
      .slice(0, c.topKPerAnchor);

    for (const s of scored) {
      rows.push({
        productKey: anchor,
        productLabel: labelOf.get(anchor) || anchor,
        relatedKey: s.rel,
        relatedLabel: labelOf.get(s.rel) || s.rel,
        coCount: s.coCount,
        support: sup,
        confidence: s.confidence,
      });
    }
  }

  // Persist: upsert qualifying rows (idempotent on unique key), then prune any
  // rows for this merchant not refreshed in this run (stale pairs disappear).
  for (const r of rows) {
    await (prisma as any).productAffinity
      .upsert({
        where: { userId_productKey_relatedKey: { userId, productKey: r.productKey, relatedKey: r.relatedKey } },
        create: { userId, ...r, computedAt: now },
        update: { ...r, computedAt: now },
      })
      .catch(() => {});
  }

  await (prisma as any).productAffinity
    .deleteMany({ where: { userId, computedAt: { lt: now } } })
    .catch(() => {});

  return { baskets: baskets.length, pairs: rows.length };
}

/** Daily batch across all merchants with order history. Bounded + idempotent. */
export async function runAffinityBatch(opts: {
  now?: Date;
  userId?: string;
  maxMerchants?: number;
} = {}): Promise<AffinityBatchResult> {
  const now = opts.now || new Date();
  const maxMerchants = Math.max(1, Math.min(2000, opts.maxMerchants || 500));

  const result: AffinityBatchResult = {
    merchantsExamined: 0,
    ordersExamined: 0,
    pairsWritten: 0,
    log: [],
  };

  let userIds: string[];
  if (opts.userId) {
    userIds = [opts.userId];
  } else {
    // Distinct merchants who have any orders — bounded.
    const rows = await prisma.order
      .findMany({ distinct: ["userId"], select: { userId: true }, take: maxMerchants })
      .catch(() => [] as any[]);
    userIds = (rows as any[]).map((r) => r.userId);
  }

  result.merchantsExamined = userIds.length;
  for (const userId of userIds) {
    const { baskets, pairs } = await computeAffinityForUser(userId, {}, now);
    result.ordersExamined += baskets;
    result.pairsWritten += pairs;
    result.log.push({ userId, baskets, pairs });
  }

  return result;
}

/**
 * Read-side: the top complementary product label for a given customer's most
 * recent order, based on the merchant's affinity matrix. Returns null when no
 * data-driven complement is available (caller falls back to a generic message).
 *
 * Used by the upsell detector + NBA upsell template so suggestions name a real
 * product instead of a generic best-seller.
 */
export async function topComplementForCustomer(args: {
  userId: string;
  customerId: string;
}): Promise<{ label: string; confidence: number } | null> {
  const lastOrder = await prisma.order
    .findFirst({
      where: { userId: args.userId, customerId: args.customerId, status: { not: "canceled" } },
      orderBy: { createdAt: "desc" },
      select: { items: { select: { name: true, notes: true } } },
    })
    .catch(() => null);
  if (!lastOrder || !(lastOrder as any).items?.length) return null;

  const anchorKeys = new Set<string>();
  for (const it of (lastOrder as any).items) anchorKeys.add(itemIdentity(it).key);
  if (anchorKeys.size === 0) return null;

  const matrix = await (prisma as any).productAffinity
    .findMany({
      where: { userId: args.userId, productKey: { in: Array.from(anchorKeys) } },
      orderBy: { confidence: "desc" },
      take: 20,
    })
    .catch(() => []);

  // Best complement that the customer did NOT already buy.
  for (const row of matrix as any[]) {
    if (anchorKeys.has(row.relatedKey)) continue;
    return { label: row.relatedLabel, confidence: row.confidence };
  }
  return null;
}
