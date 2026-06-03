// AI Intelligence Layer — Customer Value Tier (LTV classification).
//
// Derives a value tier from the order facts that getOrderRollup() / the profile
// route already compute. Pure functions — no DB writes, no schema change. The
// tier is a read-only chip used by Customer 360, the Revenue Copilot ranking,
// and broadcast targeting hints.
//
// Tiers are revenue + repeat + recency weighted, deliberately simple so they can
// be tuned without a migration (mirrors the intel detectors' philosophy).

import type { ValueTier } from "./types";

export interface ValueTierInput {
  revenue: number; // cumulative non-canceled EGP for this customer
  orderCount: number; // non-canceled orders
  daysSinceLastOrder: number | null; // null = never ordered
  leadScore: number; // for the pre-purchase "lead" tier
}

// Thresholds are whole-EGP. MENA SMB order values cluster in the hundreds–low
// thousands, so these bands map to real merchant intuition (a "gold" customer
// is a proven repeat buyer or one big spender).
export function classifyValueTier(i: ValueTierInput): ValueTier {
  const rev = Math.max(0, i.revenue || 0);
  const orders = Math.max(0, i.orderCount || 0);

  // Never purchased → it's a lead, ranked by leadScore elsewhere.
  if (orders === 0 || rev === 0) return "lead";

  // Recency decay: a big spender who vanished a long time ago is not "platinum"
  // today — they're a win-back target. We soften (not erase) the tier when the
  // last order is very old.
  const stale = i.daysSinceLastOrder != null && i.daysSinceLastOrder > 120;

  const platinum = (rev >= 15000 || (orders >= 5 && rev >= 8000));
  const gold = rev >= 6000 || orders >= 3;
  const silver = rev >= 2000 || orders >= 2;

  let tier: ValueTier;
  if (platinum) tier = "platinum";
  else if (gold) tier = "gold";
  else if (silver) tier = "silver";
  else tier = "bronze";

  // Demote one step if stale, but never below bronze (they did buy).
  if (stale) {
    if (tier === "platinum") tier = "gold";
    else if (tier === "gold") tier = "silver";
    else if (tier === "silver") tier = "bronze";
  }

  return tier;
}

// Arabic label + a relative "weight" used in revenue estimation. Weight is a
// multiplier on the merchant's AOV when forecasting the value of an opportunity
// for a customer in this tier (proven high-value buyers are worth more).
const TIER_META: Record<ValueTier, { label: string; weight: number; rank: number }> = {
  platinum: { label: "بلاتيني", weight: 2.0, rank: 4 },
  gold: { label: "ذهبي", weight: 1.5, rank: 3 },
  silver: { label: "فضي", weight: 1.15, rank: 2 },
  bronze: { label: "برونزي", weight: 1.0, rank: 1 },
  lead: { label: "محتمل", weight: 0.8, rank: 0 },
};

export function valueTierLabel(tier: ValueTier): string {
  return TIER_META[tier].label;
}

export function valueTierWeight(tier: ValueTier): number {
  return TIER_META[tier].weight;
}

export function valueTierRank(tier: ValueTier): number {
  return TIER_META[tier].rank;
}
