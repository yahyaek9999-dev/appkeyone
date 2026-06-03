// Growth Suite — Product update / delete. userId-scoped.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

function clampInt(v: any, min = 0, max = 100_000_000): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(min, Math.min(max, n));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const existing = await prisma.product.findFirst({ where: { id: params.id, userId: uid }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let b: any = {};
  try {
    b = await req.json();
  } catch {}
  const data: any = {};
  if (b.name != null) data.name = String(b.name).trim().slice(0, 200);
  if (b.imageUrl !== undefined) data.imageUrl = b.imageUrl ? String(b.imageUrl).trim().slice(0, 600) : null;
  if (b.price != null) data.price = clampInt(b.price);
  if (b.compareAtPrice !== undefined) data.compareAtPrice = b.compareAtPrice === "" || b.compareAtPrice == null ? null : clampInt(b.compareAtPrice);
  if (b.stock != null) data.stock = clampInt(b.stock);
  if (b.description !== undefined) data.description = b.description ? String(b.description).slice(0, 1000) : null;
  if (b.category !== undefined) data.category = b.category ? String(b.category).trim().slice(0, 80) : null;
  if (b.productLink !== undefined) data.productLink = b.productLink ? String(b.productLink).trim().slice(0, 600) : null;
  if (b.active != null) data.active = !!b.active;
  if (b.sortOrder != null) data.sortOrder = clampInt(b.sortOrder, 0, 100000);

  const product = await prisma.product.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true, product });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const existing = await prisma.product.findFirst({ where: { id: params.id, userId: uid }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.product.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
