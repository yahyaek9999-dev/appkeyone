import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { wa } from "@/lib/wa";

export async function POST(
  req: Request,
  ctx: { params: { customerId: string } },
) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const text = String(body.text || "").trim();
  if (!text)
    return NextResponse.json({ error: "text required" }, { status: 400 });

  const customer = await prisma.customer.findFirst({
    where: { id: ctx.params.customerId, userId: uid },
    include: { conversation: true },
  });
  if (!customer)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  // Send via the user's WhatsApp session
  const r = await wa.send(uid, customer.phone, text);
  if (!r.ok) {
    return NextResponse.json(
      { error: "send_failed", detail: r.data },
      { status: 502 },
    );
  }

  // Persist as an admin message in the conversation
  let convId = customer.conversation?.id;
  if (!convId) {
    const c = await prisma.conversation.create({
      data: { customerId: customer.id },
    });
    convId = c.id;
  }

  await prisma.message.create({
    data: { conversationId: convId, role: "admin", content: text },
  });

  // Admin reply means a real human is active; keep AI paused until the admin
  // resolves the escalation or manually resumes the bot.
  await (prisma as any).conversation
    .update({
      where: { id: convId },
      data: {
        handoffState: "human_active",
        humanActiveAt: new Date(),
        botPaused: true,
      } as any,
    })
    .catch(() => {});
  const ticketId = (customer.conversation as any)?.escalationTicketId;
  if (ticketId) {
    await (prisma as any).escalationTicket
      .update({ where: { id: ticketId }, data: { status: "human_active" } })
      .catch(() => {});
    await (prisma as any).escalationTimeline
      .create({
        data: {
          ticketId,
          userId: uid,
          kind: "human_active",
          actor: "admin",
          message: "رد بشري من لوحة الوارد.",
        },
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
