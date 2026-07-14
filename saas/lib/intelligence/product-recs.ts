// AI Intelligence Layer — Product Recommendation Engine.
//
// THE GAP THIS CLOSES: the "upsell" Next Best Action emitted a fully generic
// Arabic template ("one thing that complements what you bought") without ever
// naming a real product. OrderItem has no FK to Product (free-text `name`), so
// rather than a schema migration, this does a bounded fuzzy match of the
// customer's recently bought item names against the tenant's own Product
// catalog to find the matching category, then ranks other active, in-stock,
// not-yet-bought products in that category. Read-only, per-tenant, bounded.
import { prisma } from "@/lib/db";

export type ProductRecommendation = { name: string; price: number } | null;

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

/** Crude but dependency-free similarity: exact match, substring containment, else token overlap. */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wa = new Set(na.split(" ").filter((w) => w.length >= 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length >= 2));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

const MATCH_THRESHOLD = 0.5;

/** Recommends one real, in-stock, not-yet-bought product for this customer —
 *  or null when there isn't enough signal for a confident match (caller must
 *  fall back to the generic upsell phrasing in that case, never fabricate). */
export async function recommendProduct(
  userId: string,
  customerId: string,
): Promise<ProductRecommendation> {
  try {
    const [recentItems, products] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { userId, customerId } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { name: true },
      }),
      prisma.product.findMany({
        where: { userId, active: true },
        select: { name: true, category: true, price: true, stock: true, updatedAt: true },
        take: 300,
      }),
    ]);
    if (!recentItems.length || !products.length) return null;

    const boughtNames = Array.from(new Set(recentItems.map((i) => i.name).filter(Boolean)));

    // Find the best-matching catalog product per bought item name, to learn
    // which categories this customer actually buys into.
    const matchedCategories = new Set<string>();
    const matchedProductKeys = new Set<string>();
    for (const bought of boughtNames) {
      let best: { name: string; category: string | null; score: number } | null = null;
      for (const p of products) {
        const score = similarity(bought, p.name);
        if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
          best = { name: p.name, category: p.category, score };
        }
      }
      if (best) {
        matchedProductKeys.add(normalize(best.name));
        if (best.category) matchedCategories.add(best.category);
      }
    }
    if (!matchedCategories.size) return null;

    const candidates = products
      .filter(
        (p) =>
          p.category &&
          matchedCategories.has(p.category) &&
          !matchedProductKeys.has(normalize(p.name)) &&
          (p.stock == null || p.stock > 0),
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const top = candidates[0];
    if (!top) return null;
    return { name: top.name, price: top.price };
  } catch {
    return null;
  }
}
