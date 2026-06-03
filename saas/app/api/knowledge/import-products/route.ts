import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { importKnowledge } from "@/lib/knowledge-importer";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";

export const runtime = "nodejs";

// Import a product catalog from pasted text. Reuses the same line parser the
// onboarding wizard uses, then (a) creates Product rows for the catalog and
// (b) stores a knowledge Document so the AI can answer price questions.
export async function POST(req: Request) {
  try {
    const user = await requirePermission("settings");
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim() || text.trim().length < 5) {
      return NextResponse.json({ error: "الصق قائمة المنتجات أولاً" }, { status: 400 });
    }

    const parsed = importKnowledge(text);
    const lines = parsed.productLines.filter((p) => p.name && p.name.trim());
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "لم نتعرّف على أي منتجات. اكتب كل منتج في سطر مثل: قميص قطن — 350" },
        { status: 400 },
      );
    }

    const capped = lines.slice(0, 200);

    // (a) Create Product catalog rows.
    let productsCreated = 0;
    await prisma.$transaction(
      capped.map((p, i) => {
        productsCreated++;
        return prisma.product.create({
          data: {
            userId: user.id,
            name: p.name.trim().slice(0, 200),
            price: Math.max(0, Math.round(p.price ?? 0)),
            sortOrder: i,
          } as any,
        });
      }),
    );

    // (b) Store as a knowledge Document for retrieval.
    const docContent = capped
      .map((p) => `${p.name.trim()}${p.price ? ` — ${p.price} جنيه` : ""}`)
      .join("\n");
    const doc = await prisma.document.create({
      data: {
        userId: user.id,
        title: "المنتجات والأسعار",
        content: docContent.slice(0, 50000),
        source: "products",
      } as any,
    });
    invalidateKnowledgeCache(user.id);

    return NextResponse.json({ ok: true, productsCreated, doc });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
