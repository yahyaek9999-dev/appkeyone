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
  const paused = !!body.paused;

  const customer = await prisma.customer.findFirst({
    where: { id: ctx.params.customerId, userId: uid },
    include: { conversation: true },
  });
  if (!customer) return NextResponse.json({ error: "not found" }, { status: 404 });

  let convId = customer.conversation?.id;
  if (!convId) {
    const c = await prisma.conversation.create({ data: { customerId: customer.id } });
    convId = c.id;
  }

  await prisma.conversation.update({
    where: { id: convId },
    data: { botPaused: paused } as any,
  });

  return NextResponse.json({ ok: true, paused });
}
