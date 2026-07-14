/**
 * AI reply catalog-mismatch guard (post-hoc, non-blocking).
 *
 * Scans an AI-generated reply for price mentions and flags any that don't
 * match a real, active product in the tenant's catalog — a hallucinated
 * price reaching a customer is the exact risk this closes visibility on.
 *
 * Deliberately NOT wired into the live WhatsApp incoming-message hot path
 * (app/api/whatsapp/incoming/route.ts): that file IS the send-adjacent
 * pipeline, and a synchronous per-message DB+regex check there would add
 * latency and a new failure surface to every single inbound message for
 * every tenant. Instead this runs from a cron sweep (api/cron/ai-catalog-guard)
 * shortly after each reply is saved — same "detect and surface, don't
 * block" pattern as lib/arena/hallucination.ts, just closing the specific
 * "checked against the live catalog" gap that one doesn't cover.
 */
import { prisma } from "@/lib/db";

// Matches a 2-6 digit number immediately followed by a currency word/symbol
// (Arabic or Latin script) — e.g. "150 جنيه", "٢٥٠ج", "$29", "29 دولار".
// Terminated with a lookahead for whitespace/punctuation/end-of-string
// rather than \b: \b is defined against ASCII \w, so it never matches at
// the end of an Arabic word (Arabic letters aren't \w) and silently killed
// every match here — caught by a functional test seeding a real hallucinated
// price and finding zero matches.
const PRICE_RE = /(\d{2,6})\s*(?:ج\.?م?|جنيه|جنية|egp|EGP|\$|دولار|le|LE)(?=[\s.,!?)،؛]|$)/g;

export interface CatalogMismatch {
  mentionedPrice: number;
  reason: string;
}

/** Pure function: no DB access. Extracts price mentions from `text` and
 * flags any not within 1% (min 1 unit) of a known active product price. */
export function findCatalogMismatches(
  text: string,
  knownPrices: number[],
): CatalogMismatch[] {
  const mismatches: CatalogMismatch[] = [];
  if (knownPrices.length === 0) return mismatches; // no catalog to compare against

  const seen = new Set<number>();
  for (const m of text.matchAll(PRICE_RE)) {
    const price = parseInt(m[1], 10);
    if (!Number.isFinite(price) || seen.has(price)) continue;
    seen.add(price);
    const isKnown = knownPrices.some((k) => Math.abs(k - price) <= Math.max(1, k * 0.01));
    if (!isKnown) {
      mismatches.push({
        mentionedPrice: price,
        reason: `الرد ذكر سعر ${price} غير موجود في كتالوج المنتجات النشط`,
      });
    }
  }
  return mismatches;
}

/** Loads the tenant's active product prices (+ compare-at prices) for comparison. */
export async function getActiveCatalogPrices(userId: string): Promise<number[]> {
  const products = await prisma.product.findMany({
    where: { userId, active: true },
    select: { price: true, compareAtPrice: true },
  });
  const prices: number[] = [];
  for (const p of products) {
    prices.push(p.price);
    if (p.compareAtPrice != null) prices.push(p.compareAtPrice);
  }
  return prices;
}
