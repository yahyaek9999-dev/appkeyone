import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ customerId: string }> }
) {
  const params = await ctx.params;
  const uid = await getUserIdForPermission("inbox");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const notes = String(body.notes || "");

  const exists = await prisma.customer.findFirst({
    where: { id: params.customerId, userId: uid },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.customer.update({
    where: { id: params.customerId },
    data: { notes } as any,
  });

  return NextResponse.json({ ok: true });
}
