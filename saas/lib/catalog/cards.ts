// Growth Suite — build WhatsApp-friendly product cards + auto-coupon offers.
//
// Used additively by the incoming AI path: ONLY called when an intent gate
// already matched (catalog request / discount signal), so the extra queries
// never touch the normal reply path. Pure text output — sent through the
// existing protected pipeline by the caller.

import { prisma } from "@/lib/db";
import { fmtMoney } from "@/lib/format";

const MAX_CARDS = 4;

/**
 * Returns a formatted product-card block (Arabic, WhatsApp-friendly) for the
 * merchant's active products, or null if there are none. Deterministic — not
 * run through the humanizer, so prices/links stay intact.
 */
export async function buildCatalogCards(userId: string): Promise<string | null> {
  const products = await prisma.product
    .findMany({
      where: { userId, active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: MAX_CARDS,
    })
    .catch(() => [] as any[]);

  if (!products || products.length === 0) return null;

  const lines: string[] = ["🛍️ *المنتجات المتاحة:*", ""];
  for (const p of products) {
    let line = `• *${p.name}* — ${fmtMoney(p.price)}`;
    if (p.compareAtPrice && p.compareAtPrice > p.price) line += ` (كان ${fmtMoney(p.compareAtPrice)})`;
    lines.push(line);
    if (p.description) lines.push(`  ${String(p.description).slice(0, 120)}`);
    const link = p.productLink || p.imageUrl;
    if (link) lines.push(`  ${link}`);
    lines.push("");
  }
  lines.push("اطلب اللي عايزه وأنا أساعدك تكمّل 😊");
  return lines.join("\n").trim();
}

/**
 * Finds an active, valid, auto-offer coupon and returns a formatted offer line,
 * bumping offeredCount. Returns null if none is eligible. The CALLER decides
 * whether the customer qualifies (e.g. discount signal + non-buyer).
 */
export async function maybeBuildAutoCoupon(userId: string): Promise<string | null> {
  const now = new Date();
  const coupon = await prisma.coupon
    .findFirst({
      where: {
        userId,
        active: true,
        autoOffer: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => null);

  if (!coupon) return null;
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return null;

  // Record that it was offered (best-effort; never block the reply).
  await prisma.coupon.update({ where: { id: coupon.id }, data: { offeredCount: { increment: 1 } } }).catch(() => {});

  const amount = coupon.type === "percent" ? `${coupon.value}%` : fmtMoney(coupon.value);
  let line = `🎟️ عرض خاص ليك: استخدم كود *${coupon.code}* واحصل على خصم ${amount}`;
  if (coupon.expiresAt) {
    line += ` — صالح حتى ${coupon.expiresAt.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}`;
  }
  return line;
}
