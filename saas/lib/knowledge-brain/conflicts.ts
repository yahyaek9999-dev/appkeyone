// Knowledge Brain Pro — automatic conflict (contradiction) detection.
//
// Deterministic + rule-based (NO LLM, no external keys): it compares the price
// the merchant states inside knowledge sources (documents, quick replies)
// against the authoritative catalog price for the same product. When a source
// names a product and quotes a price that matches neither the product's price
// nor its compare-at price, that's a contradiction the AI could repeat — so we
// surface it. Stale unresolved conflicts are pruned each rescan; resolved ones
// are kept as history.
import { prisma } from "@/lib/db";

export interface ConflictScanResult {
  scanned: { products: number; documents: number; quickReplies: number };
  found: number;
  created: number;
}

/** Pull integer money values that sit next to a currency token or price word. */
function extractPricesNear(text: string): number[] {
  const out: number[] = [];
  // number (with optional thousands separators) followed by an EGP currency token
  const cur =
    /(\d{1,3}(?:[,،]\d{3})+|\d{2,7})(?:\.\d{1,2})?\s*(?:جنيه|جنية|ج\.?\s?م|egp|le\b|pound|£)/gi;
  // price word then number
  const word =
    /(?:سعر|السعر|بسعر|ثمن|بثمن|price)\s*[:=]?\s*(\d{1,3}(?:[,،]\d{3})+|\d{2,7})(?:\.\d{1,2})?/gi;
  for (const re of [cur, word]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = Math.round(parseFloat(m[1].replace(/[,،\s]/g, "")));
      if (Number.isFinite(n) && n > 0) out.push(n);
    }
  }
  return out;
}

/** Windows of text surrounding each case-insensitive occurrence of `needle`. */
function windowsAround(haystack: string, needle: string, radius = 90): string[] {
  if (!needle || needle.length < 2) return [];
  const hay = haystack.toLowerCase();
  const ndl = needle.toLowerCase();
  const wins: string[] = [];
  let from = 0;
  for (let i = 0; i < 25; i++) {
    const idx = hay.indexOf(ndl, from);
    if (idx === -1) break;
    wins.push(haystack.slice(Math.max(0, idx - radius), idx + ndl.length + radius));
    from = idx + ndl.length;
  }
  return wins;
}

export async function scanConflicts(userId: string): Promise<ConflictScanResult> {
  const [products, documents, bots] = await Promise.all([
    prisma.product.findMany({
      where: { userId },
      select: { id: true, name: true, price: true, compareAtPrice: true },
    }),
    prisma.document.findMany({
      where: { userId },
      select: { id: true, title: true, content: true },
    }),
    prisma.bot.findMany({ where: { userId }, select: { id: true } }),
  ]);
  const botIds = bots.map((b) => b.id);
  const quickReplies = botIds.length
    ? await prisma.quickReply.findMany({
        where: { botId: { in: botIds } },
        select: { id: true, reply: true },
      })
    : [];

  const sources: { type: string; id: string; label: string; text: string }[] = [
    ...documents.map((d) => ({
      type: "document",
      id: d.id,
      label: `مستند: ${d.title}`,
      text: d.content || "",
    })),
    ...quickReplies.map((q) => ({
      type: "quickReply",
      id: q.id,
      label: "رد سريع",
      text: q.reply || "",
    })),
  ];

  const currentSignatures: string[] = [];
  let created = 0;

  for (const p of products) {
    if (!p.name || p.name.trim().length < 2) continue;
    const ok = new Set<number>([p.price, ...(p.compareAtPrice ? [p.compareAtPrice] : [])]);
    for (const src of sources) {
      if (!src.text) continue;
      const prices = new Set<number>();
      for (const win of windowsAround(src.text, p.name)) {
        for (const v of extractPricesNear(win)) prices.add(v);
      }
      for (const v of prices) {
        if (ok.has(v)) continue; // matches catalog price (or compare-at) → fine
        const signature = `price|${p.id}|${src.type}:${src.id}|${v}`;
        currentSignatures.push(signature);
        const res = await prisma.knowledgeConflict.upsert({
          where: { userId_signature: { userId, signature } },
          create: {
            userId,
            entity: p.name,
            conflictType: "price",
            sourceALabel: `الكتالوج: ${p.name}`,
            sourceAValue: `${p.price} ج.م`,
            sourceBLabel: src.label,
            sourceBValue: `${v} ج.م`,
            suggestion: `وحّد السعر: إمّا حدّث المصدر إلى ${p.price} ج.م كما في الكتالوج، أو حدّث سعر المنتج في الكتالوج.`,
            severity: "high",
            signature,
          },
          update: { entity: p.name, sourceAValue: `${p.price} ج.م`, sourceBValue: `${v} ج.م` },
        });
        if (res.createdAt.getTime() === res.updatedAt.getTime()) created++;
      }
    }
  }

  // Prune unresolved conflicts that no longer reproduce (keep resolved history).
  await prisma.knowledgeConflict.deleteMany({
    where: {
      userId,
      resolved: false,
      signature: { notIn: currentSignatures.length ? currentSignatures : ["__none__"] },
    },
  });

  return {
    scanned: {
      products: products.length,
      documents: documents.length,
      quickReplies: quickReplies.length,
    },
    found: currentSignatures.length,
    created,
  };
}
