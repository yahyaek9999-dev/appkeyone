import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined; // pending | confirmed | shipped | delivered | canceled
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get("take") || 30)));
  const skip = Math.max(0, Number(url.searchParams.get("skip") || 0));

  const where: any = { userId: user.id };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    (prisma as any).order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    (prisma as any).order.count({ where }),
  ]);

  return NextResponse.json({ ok: true, total, items });
}
