/**
 * lib/wallet/meta-rates.ts — Meta (WhatsApp Cloud) conversation rate card.
 *
 * Meta bills per CONVERSATION (a 24h window) by CATEGORY, and the price varies by
 * the recipient's COUNTRY. KEYONE charges the tenant `rateUsd` per conversation
 * and pays Meta `metaCostUsd`; the difference is platform margin.
 *
 * Resolution order for a (country, category) pair:
 *   1. active MetaRateCard row for (country, category)
 *   2. active MetaRateCard row for ("*", category)
 *   3. in-code DEFAULT_RATES[country][category]
 *   4. in-code DEFAULT_RATES["*"][category]
 *   5. zero (never throw)
 *
 * All numbers are illustrative, admin-editable defaults — NOT an authoritative
 * Meta price list. The UI labels derived costs as estimates, consistent with the
 * existing /admin/tenant-costs page.
 */

import { prisma } from "@/lib/db";
import { roundUsd } from "./money";

export type MetaCategory = "marketing" | "utility" | "authentication" | "service";

export const META_CATEGORIES: MetaCategory[] = ["marketing", "utility", "authentication", "service"];

export interface Rate {
  rateUsd: number;     // charged to the tenant
  metaCostUsd: number; // KEYONE's underlying cost to Meta
}

type RateMap = Record<string, Record<MetaCategory, Rate>>;

/** In-code default rate card. `*` is the global fallback. */
export const DEFAULT_RATES: RateMap = {
  "*":  { marketing: { rateUsd: 0.0625, metaCostUsd: 0.05 },   utility: { rateUsd: 0.0125, metaCostUsd: 0.01 },   authentication: { rateUsd: 0.025, metaCostUsd: 0.02 },   service: { rateUsd: 0, metaCostUsd: 0 } },
  EG:   { marketing: { rateUsd: 0.075,  metaCostUsd: 0.0588 }, utility: { rateUsd: 0.022,  metaCostUsd: 0.0168 }, authentication: { rateUsd: 0.046, metaCostUsd: 0.0364 }, service: { rateUsd: 0, metaCostUsd: 0 } },
  SA:   { marketing: { rateUsd: 0.045,  metaCostUsd: 0.0345 }, utility: { rateUsd: 0.020,  metaCostUsd: 0.0157 }, authentication: { rateUsd: 0.038, metaCostUsd: 0.0300 }, service: { rateUsd: 0, metaCostUsd: 0 } },
  AE:   { marketing: { rateUsd: 0.049,  metaCostUsd: 0.0384 }, utility: { rateUsd: 0.022,  metaCostUsd: 0.0175 }, authentication: { rateUsd: 0.043, metaCostUsd: 0.0341 }, service: { rateUsd: 0, metaCostUsd: 0 } },
  US:   { marketing: { rateUsd: 0.032,  metaCostUsd: 0.025 },  utility: { rateUsd: 0,      metaCostUsd: 0 },      authentication: { rateUsd: 0.018, metaCostUsd: 0.0135 }, service: { rateUsd: 0, metaCostUsd: 0 } },
};

/** E.164 calling-code → ISO-2 country. Longest-prefix match wins. */
const CALLING_CODES: Array<[string, string]> = [
  ["20", "EG"], ["212", "MA"], ["213", "DZ"], ["216", "TN"], ["218", "LY"], ["249", "SD"],
  ["966", "SA"], ["971", "AE"], ["974", "QA"], ["965", "KW"], ["973", "BH"], ["968", "OM"],
  ["962", "JO"], ["961", "LB"], ["964", "IQ"], ["970", "PS"], ["963", "SY"], ["967", "YE"],
  ["90", "TR"], ["1", "US"], ["44", "GB"], ["49", "DE"], ["33", "FR"], ["39", "IT"],
  ["34", "ES"], ["91", "IN"], ["92", "PK"], ["234", "NG"], ["27", "ZA"], ["55", "BR"],
];
// Longest prefix first so "966" matches before "9".
const SORTED_CODES = [...CALLING_CODES].sort((a, b) => b[0].length - a[0].length);

/** Best-effort ISO-2 country from a phone number (E.164 or local). "" if unknown. */
export function countryFromPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = String(phone).replace(/[^\d]/g, "");
  if (!digits) return "";
  for (const [code, iso] of SORTED_CODES) {
    if (digits.startsWith(code)) return iso;
  }
  return "";
}

export interface RateResolver {
  (country: string, category: MetaCategory): Rate;
}

function defaultRate(country: string, category: MetaCategory): Rate {
  const c = (country || "*").toUpperCase();
  const r = (DEFAULT_RATES[c] && DEFAULT_RATES[c][category]) || DEFAULT_RATES["*"][category];
  return { rateUsd: roundUsd(r.rateUsd), metaCostUsd: roundUsd(r.metaCostUsd) };
}

/**
 * Load the full active rate card from the DB and return a fast in-memory
 * resolver merged with the in-code defaults. Call once per reconciler run.
 */
export async function loadRateCard(): Promise<RateResolver> {
  const rows = await prisma.metaRateCard.findMany({ where: { active: true } }).catch(() => [] as any[]);
  const byKey = new Map<string, Rate>();
  for (const r of rows) {
    byKey.set(`${String(r.country).toUpperCase()}:${r.category}`, {
      rateUsd: roundUsd(r.rateUsd),
      metaCostUsd: roundUsd(r.metaCostUsd),
    });
  }
  return (country: string, category: MetaCategory): Rate => {
    const c = (country || "*").toUpperCase();
    return (
      byKey.get(`${c}:${category}`) ||
      byKey.get(`*:${category}`) ||
      defaultRate(c, category)
    );
  };
}

/** Single-pair lookup (used by the cost calculator). */
export async function resolveRate(country: string, category: MetaCategory): Promise<Rate> {
  const resolver = await loadRateCard();
  return resolver(country, category);
}

/**
 * Seed the DB rate card from the in-code defaults (idempotent upsert). Used to
 * populate the admin editor on first visit so operators can override prices.
 */
export async function seedRateCard(updatedBy = "system"): Promise<number> {
  let n = 0;
  for (const [country, byCat] of Object.entries(DEFAULT_RATES)) {
    for (const category of META_CATEGORIES) {
      const r = byCat[category];
      await prisma.metaRateCard.upsert({
        where: { country_category: { country, category } },
        update: {}, // never clobber an admin's edits
        create: { country, category, rateUsd: roundUsd(r.rateUsd), metaCostUsd: roundUsd(r.metaCostUsd), updatedBy },
      }).then(() => { n++; }).catch(() => {});
    }
  }
  return n;
}
