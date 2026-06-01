// AI Sales OS — order rollup (single source of truth for order facts).
//
// WHY THIS EXISTS: Customer.orderCount / totalOrderValue / lastOrderAt are
// declared in the schema but NEVER written on the order-creation path, so they
// are always 0. Any funnel / segment / forecast that trusts them shows zeros
// for real buyers. This helper derives per-customer order facts straight from
// the Order table in one bounded pass, and is reused by every new analytics
// module so the numbers are actually correct.
//
// Read-only. Money is whole EGP (Order.total is integer EGP).

import { prisma } from "@/lib/db";

// "Paid" is inferred from lifecycle status — the schema has no payment-status
// column. Everything past `pending` (and not `canceled`) is treated as paid.
export const PAID_STATUSES = [
  "confirmed",
  "preparing",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

const PAID_SET = new Set<string>(PAID_STATUSES);

export interface CustomerOrderStats {
  orders: number; // non-canceled order count
  paidOrders: number; // orders whose status ∈ PAID_STATUSES
  revenue: number; // sum(total) over non-canceled orders (EGP)
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  sources: string[]; // distinct order sources (auto | manual | external…)
}

export interface OrderRollup {
  byCustomer: Map<string, CustomerOrderStats>;
  totals: {
    orders: number; // non-canceled
    paidOrders: number;
    canceledOrders: number;
    revenue: number; // non-canceled
    paidRevenue: number;
    customersWithOrders: number; // distinct customers with ≥1 non-canceled order
    customersWithPaidOrders: number;
    repeatCustomers: number; // ≥2 non-canceled orders
    aov: number; // paidRevenue / paidOrders (fallback revenue/orders)
  };
  truncated: boolean; // true if the order scan hit the cap
}

const MAX_ORDERS = 60_000;

export async function getOrderRollup(
  userId: string,
  opts: { sinceDays?: number; now?: Date } = {},
): Promise<OrderRollup> {
  const now = opts.now ?? new Date();
  const where: any = { userId };
  if (opts.sinceDays && opts.sinceDays > 0) {
    where.createdAt = { gte: new Date(now.getTime() - opts.sinceDays * 86400000) };
  }

  const orders = await prisma.order.findMany({
    where,
    select: { customerId: true, total: true, status: true, source: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: MAX_ORDERS + 1,
  });

  const truncated = orders.length > MAX_ORDERS;
  const rows = truncated ? orders.slice(0, MAX_ORDERS) : orders;

  const byCustomer = new Map<string, CustomerOrderStats>();
  let orderCount = 0;
  let paidOrders = 0;
  let canceledOrders = 0;
  let revenue = 0;
  let paidRevenue = 0;

  for (const o of rows) {
    if (o.status === "canceled") {
      canceledOrders++;
      continue; // canceled orders don't count toward orders/revenue
    }
    const total = o.total || 0;
    const isPaid = PAID_SET.has(o.status);
    orderCount++;
    revenue += total;
    if (isPaid) {
      paidOrders++;
      paidRevenue += total;
    }

    let s = byCustomer.get(o.customerId);
    if (!s) {
      s = { orders: 0, paidOrders: 0, revenue: 0, firstOrderAt: null, lastOrderAt: null, sources: [] };
      byCustomer.set(o.customerId, s);
    }
    s.orders++;
    s.revenue += total;
    if (isPaid) s.paidOrders++;
    if (!s.firstOrderAt || o.createdAt < s.firstOrderAt) s.firstOrderAt = o.createdAt;
    if (!s.lastOrderAt || o.createdAt > s.lastOrderAt) s.lastOrderAt = o.createdAt;
    const src = o.source || "auto";
    if (!s.sources.includes(src)) s.sources.push(src);
  }

  let customersWithPaidOrders = 0;
  let repeatCustomers = 0;
  for (const s of byCustomer.values()) {
    if (s.paidOrders > 0) customersWithPaidOrders++;
    if (s.orders >= 2) repeatCustomers++;
  }

  const aov =
    paidOrders > 0
      ? Math.round(paidRevenue / paidOrders)
      : orderCount > 0
        ? Math.round(revenue / orderCount)
        : 0;

  return {
    byCustomer,
    totals: {
      orders: orderCount,
      paidOrders,
      canceledOrders,
      revenue,
      paidRevenue,
      customersWithOrders: byCustomer.size,
      customersWithPaidOrders,
      repeatCustomers,
      aov,
    },
    truncated,
  };
}
