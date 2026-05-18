import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function POST(
  req: Request,
  ctx: { params: { customerId: string } }
) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const notes = String(body.notes || "");

  const exists = await prisma.customer.findFirst({
    where: { id: ctx.params.customerId, userId: uid },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.customer.update({
    where: { id: ctx.params.customerId },
    data: { notes } as any,
  });

  return NextResponse.json({ ok: true });
}
