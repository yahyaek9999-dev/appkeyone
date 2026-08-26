import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export async function POST(
  req: Request,
  ctx: { params: { customerId: string } },
) {
  // human_handoff is a Growth (tier 1) capability. This route is the deliberate
  // "take over from the AI" switch, so it is the entitlement boundary. The
  // incoming-message pipeline is untouched: it keeps honouring whatever
  // handoffState already exists, so no in-flight conversation changes behaviour.
  const gate = await apiGate("human_handoff", "inbox");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("inbox");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const paused = !!body.paused;

  const customer = await prisma.customer.findFirst({
    where: { id: ctx.params.customerId, userId: uid },
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
