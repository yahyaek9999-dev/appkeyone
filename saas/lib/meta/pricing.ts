/**
 * Meta Enterprise — conversation pricing engine.
 *
 * Meta charges per CONVERSATION (a 24h category window), priced by destination
 * market (country) and category (marketing / utility / authentication /
 * service). This module is the single source of truth for cost math:
 *
 *   wholesale cost (Meta)  →  + platform markup  →  + tax  =  charged
 *
 * All money is held in micro-USD (USD × 1e6) for exact integer arithmetic; the
 * EGP wallet debit is derived from this in billing.ts via the configured FX.
 *
 * The MATH here is exact and final. Only the seed numbers in DEFAULT_RATES are
 * configuration — an admin tunes the live per-market prices in the pricing
 * screen (and the exact figures come from Meta's published rate card).
 */

import { prisma } from "@/lib/db";

export type MetaCategory = "marketing" | "utility" | "authentication" | "service";
export const META_CATEGORIES: MetaCategory[] = [
  "marketing",
  "utility",
  "authentication",
  "service",
];

/** Normalize any Meta/template category casing to our canonical lowercase. */
export function normalizeCategory(raw: string | null | undefined): MetaCategory {
  const c = (raw || "").toLowerCase();
  if (c.startsWith("market")) return "marketing";
  if (c.startsWith("auth")) return "authentication";
  if (c.startsWith("util")) return "utility";
  return "service";
}

/**
 * Default per-conversation wholesale prices (micro-USD = USD × 1e6). Sensible
 * starting values the admin tunes per market — service windows are free within
 * Meta's free tier. country "*" is the fallback market; "EG" is KEYONE's
 * primary market. `markupBps`/`taxBps` default to 0 (admin opts in).
 */
const DEFAULT_RATES: Array<{ country: string; category: MetaCategory; baseCostMicroUsd: number }> =
  [
    { country: "*", category: "marketing", baseCostMicroUsd: 50_000 },
    { country: "*", category: "utility", baseCostMicroUsd: 30_000 },
    { country: "*", category: "authentication", baseCostMicroUsd: 35_000 },
    { country: "*", category: "service", baseCostMicroUsd: 0 },
    { country: "EG", category: "marketing", baseCostMicroUsd: 107_300 },
    { country: "EG", category: "utility", baseCostMicroUsd: 30_000 },
    { country: "EG", category: "authentication", baseCostMicroUsd: 32_400 },
    { country: "EG", category: "service", baseCostMicroUsd: 0 },
  ];

/** Idempotently ensure default rate rows exist. NEVER overwrites admin edits. */
export async function ensureDefaultRates(): Promise<number> {
  let created = 0;
  for (const r of DEFAULT_RATES) {
    const existing = await prisma.metaRate.findUnique({
      where: { country_category: { country: r.country, category: r.category } },
    });
    if (!existing) {
      await prisma.metaRate.create({
        data: { country: r.country, category: r.category, baseCostMicroUsd: r.baseCostMicroUsd },
      });
      created++;
    }
  }
  return created;
}

/** Resolve the effective rate for (country, category): exact market first, then
 *  the "*" fallback market. Returns null only if no fallback row exists. */
export async function resolveRate(
  country: string | null | undefined,
  category: MetaCategory | string,
) {
  const cat = normalizeCategory(category);
  const c = (country || "*").toUpperCase();
  const exact =
    c !== "*"
      ? await prisma.metaRate.findUnique({
          where: { country_category: { country: c, category: cat } },
        })
      : null;
  if (exact && exact.enabled) return exact;
  const fallback = await prisma.metaRate.findUnique({
    where: { country_category: { country: "*", category: cat } },
  });
  return fallback && fallback.enabled ? fallback : (exact ?? fallback);
}

export interface ChargeBreakdown {
  costMicroUsd: number; // wholesale (what Meta charges the platform)
  markupMicroUsd: number; // platform markup
  taxMicroUsd: number; // tax on (cost + markup)
  chargedMicroUsd: number; // total the tenant owes
}

/** Exact charge breakdown from a wholesale base + markup/tax in basis points. */
export function computeCharge(
  baseCostMicroUsd: number,
  markupBps: number,
  taxBps: number,
): ChargeBreakdown {
  const cost = Math.max(0, Math.round(baseCostMicroUsd || 0));
  const markup = Math.round((cost * Math.max(0, markupBps || 0)) / 10_000);
  const taxable = cost + markup;
  const tax = Math.round((taxable * Math.max(0, taxBps || 0)) / 10_000);
  return {
    costMicroUsd: cost,
    markupMicroUsd: markup,
    taxMicroUsd: tax,
    chargedMicroUsd: taxable + tax,
  };
}

/** Profit (micro-USD) = charged − wholesale cost. */
export function profitMicroUsd(b: ChargeBreakdown): number {
  return b.chargedMicroUsd - b.costMicroUsd;
}

// ---- FX (USD → EGP) ---------------------------------------------------------
// Admin-configurable via env META_USD_EGP_RATE; defaults to a conservative 50.
const DEFAULT_USD_EGP = 50;

export function getUsdEgpRateMicro(): number {
  const env = Number(process.env.META_USD_EGP_RATE);
  const rate = Number.isFinite(env) && env > 0 ? env : DEFAULT_USD_EGP;
  return Math.round(rate * 1_000_000);
}

/** Convert micro-USD → micro-EGP using the configured FX rate. */
export function microUsdToMicroEgp(
  microUsd: number,
  fxMicro: number = getUsdEgpRateMicro(),
): number {
  return Math.round((microUsd * fxMicro) / 1_000_000);
}

/** Whole EGP (rounded) from micro-USD — for display only; billing.ts uses the
 *  carry accumulator for exact, unbiased wallet debits. */
export function microUsdToEgp(microUsd: number, fxMicro: number = getUsdEgpRateMicro()): number {
  return Math.round(microUsdToMicroEgp(microUsd, fxMicro) / 1_000_000);
}
