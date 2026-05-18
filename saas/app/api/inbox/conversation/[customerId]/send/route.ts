import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { wa } from "@/lib/wa";

export async function POST(
  req: Request,
  ctx: { params: { customerId: string } }
) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const text = String(body.text || "").trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const customer = await prisma.customer.findFirst({
    where: { id: ctx.params.customerId, userId: uid },
    include: { conversation: true },
  });
  if (!customer) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Send via the user's WhatsApp session
  const r = await wa.send(uid, customer.phone, text);
  if (!r.ok) {
    return NextResponse.json(
      { error: "send_failed", detail: r.data },
      { status: 502 }
    );
  }

  // Persist as an admin message in the conversation
  let convId = customer.conversation?.id;
  if (!convId) {
    const c = await prisma.conversation.create({ data: { customerId: customer.id } });
    convId = c.id;
  }

  await prisma.message.create({
    data: { conversationId: convId, role: "admin", content: text },
  });

  return NextResponse.json({ ok: true });
}
