// Growth Suite — Product Catalog (list + create). userId-scoped, additive.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { httpUrlOrNull } from "@/lib/url-safe";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const items = await prisma.product.findMany({
    where: { userId: uid },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  return NextResponse.json({ items });
}

function clampInt(v: any, min = 0, max = 100_000_000): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(min, Math.min(max, n));
}

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let b: any = {};
  try {
    b = await req.json();
  } catch {}
  const name = String(b.name || "").trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: "اسم المنتج مطلوب" }, { status: 400 });

  const product = await prisma.product.create({
    data: {
      userId: uid,
      name,
      imageUrl: httpUrlOrNull(b.imageUrl),
      price: clampInt(b.price),
      compareAtPrice: b.compareAtPrice != null && b.compareAtPrice !== "" ? clampInt(b.compareAtPrice) : null,
      stock: clampInt(b.stock),
      description: b.description ? String(b.description).slice(0, 1000) : null,
      category: b.category ? String(b.category).trim().slice(0, 80) : null,
      productLink: httpUrlOrNull(b.productLink),
      active: b.active !== false,
      sortOrder: clampInt(b.sortOrder, 0, 100000),
    },
  });
  return NextResponse.json({ ok: true, product });
}
