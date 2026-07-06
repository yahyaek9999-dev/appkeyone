/**
 * lib/membership/customer-cap.ts — CRM customer-count cap (safe enforcement).
 *
 * Design contract (non-regressive by construction):
 *   - 0 = UNLIMITED (legacy/no-sub tenants resolve to 0 → never capped).
 *   - The effective cap is GRANDFATHERED: it can never be below the tenant's
 *     CURRENT customer count, and an optional Subscription.contractedCustomers
 *     floor raises it further. So enabling enforcement can never strand an
 *     existing tenant or require deleting customers.
 *   - `checkCustomerCap` only ever returns allowed:false when CUSTOMER_CAP_
 *     ENFORCEMENT=1 AND the tenant is over its grandfathered cap. It is NOT
 *     wired into the customer-creation paths (chat/incoming/commerce) — those
 *     are the protected pipeline. It is exposed for the dashboard, admin, and a
 *     future approved enforcement point.
 */

import { prisma } from "@/lib/db";
import { getEntitlements } from "./entitlements";

export function customerCapEnforcementEnabled(): boolean {
  return process.env.CUSTOMER_CAP_ENFORCEMENT === "1";
}

export async function countCustomers(userId: string): Promise<number> {
  return prisma.customer.count({ where: { userId } }).catch(() => 0);
}

export interface CustomerCapState {
  current: number;
  planLimit: number;       // from the plan/catalog (0 = unlimited)
  contracted: number | null; // per-tenant floor, if set
  effectiveCap: number;    // 0 = unlimited; else grandfathered max
  remaining: number | null; // null = unlimited
  unlimited: boolean;
  overCap: boolean;
  enforced: boolean;       // whether enforcement is globally ON
  usagePct: number;        // 0..100 (0 when unlimited)
}

/** Resolve the full cap state for a tenant. Never throws. */
export async function getCustomerCapState(userId: string): Promise<CustomerCapState> {
  const [current, ent, sub] = await Promise.all([
    countCustomers(userId),
    getEntitlements(userId).catch(() => null),
    prisma.subscription.findUnique({ where: { userId }, select: { contractedCustomers: true } }).catch(() => null),
  ]);
  const planLimit = Math.max(0, ent?.limits?.customers || 0);
  const contracted = sub?.contractedCustomers ?? null;
  const enforced = customerCapEnforcementEnabled();

  // 0 plan limit = unlimited.
  if (planLimit === 0) {
    return { current, planLimit: 0, contracted, effectiveCap: 0, remaining: null, unlimited: true, overCap: false, enforced, usagePct: 0 };
  }
  // Grandfather: cap is never below current count, and a contracted floor raises it.
  const effectiveCap = Math.max(planLimit, contracted || 0, current);
  const remaining = Math.max(0, effectiveCap - current);
  // overCap reflects the *plan* limit (for display/upsell), not the grandfathered cap.
  const overCap = current > Math.max(planLimit, contracted || 0);
  return {
    current, planLimit, contracted, effectiveCap, remaining, unlimited: false, overCap, enforced,
    usagePct: effectiveCap > 0 ? Math.min(100, Math.round((current / effectiveCap) * 100)) : 0,
  };
}

/**
 * Decide whether ONE more customer may be created. NEVER blocks unless
 * enforcement is ON and the tenant is over its grandfathered cap. Fail-open.
 */
export async function checkCustomerCap(userId: string): Promise<{ allowed: boolean; reason?: string; state: CustomerCapState }> {
  const state = await getCustomerCapState(userId).catch(() => null);
  if (!state) return { allowed: true, state: { current: 0, planLimit: 0, contracted: null, effectiveCap: 0, remaining: null, unlimited: true, overCap: false, enforced: false, usagePct: 0 } };
  if (state.unlimited) return { allowed: true, state };
  if (!state.enforced) return { allowed: true, reason: "enforcement_off", state };
  // Grandfathered cap is >= current, so an existing tenant is never blocked from
  // serving who they already have; only NEW growth beyond the cap is gated.
  if (state.current >= state.effectiveCap) return { allowed: false, reason: "cap_reached", state };
  return { allowed: true, state };
}

/** Admin: tenants at/over their plan limit (observability for the cap dashboard). */
export async function overCapTenants({ limit = 100 }: { limit?: number } = {}) {
  // Bounded scan over tenants with a subscription; cap dashboards are admin-only.
  const subs = await prisma.subscription.findMany({
    where: { status: "active" },
    select: { userId: true },
    take: 2000,
  }).catch(() => []);
  const rows: Array<{ userId: string } & CustomerCapState> = [];
  for (const s of subs) {
    const st = await getCustomerCapState(s.userId).catch(() => null);
    if (st && !st.unlimited && st.usagePct >= 80) rows.push({ userId: s.userId, ...st });
    if (rows.length >= limit) break;
  }
  return rows.sort((a, b) => b.usagePct - a.usagePct);
}
