import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const rows = await prisma.knowledgeGap.findMany({
    where: { userId: uid, resolved: false },
    orderBy: [{ occurrences: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
  const now = Date.now();
  const items = rows
    .map((g: any) => {
      const ageHours = Math.max(
        1,
        (now - new Date(g.updatedAt || g.createdAt).getTime()) / 36e5,
      );
      const q = String(g.question || "").toLowerCase();
      const productAware =
        /سعر|بكام|منتج|مقاس|لون|شحن|توصيل|price|product|shipping/.test(q);
      const score = Math.round(
        (g.occurrences || 1) * 20 +
          (productAware ? 25 : 0) +
          Math.max(0, 24 - ageHours) * 1.5 +
          (g.lastSentiment === "angry" ? 20 : 0),
      );
      return {
        ...g,
        score,
        productHint: g.productHint || (productAware ? "commerce" : null),
        reasons: [
          g.occurrences > 1 ? "high_frequency" : null,
          productAware ? "product_or_faq" : null,
          g.lastSentiment === "angry" ? "angry_customer" : null,
        ].filter(Boolean),
      };
    })
    .sort((a, b) => b.score - a.score || b.occurrences - a.occurrences)
    .slice(0, 50);
  return NextResponse.json({ items });
}
