import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ customerId: string }> },
) {
  const params = await ctx.params;
  const uid = await getUserIdForPermission("inbox");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const paused = !!body.paused;

  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, userId: uid },
    include: { conversation: true },
  });
  if (!customer)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  let convId = customer.conversation?.id;
  if (!convId) {
    const c = await prisma.conversation.create({
      data: { customerId: customer.id },
    });
    convId = c.id;
  }

  await prisma.conversation.update({
    where: { id: convId },
    data: {
      botPaused: paused,
      handoffState: paused ? "human_active" : "ai_active",
      humanActiveAt: paused ? new Date() : null,
    } as any,
  });

  return NextResponse.json({ ok: true, paused });
}
