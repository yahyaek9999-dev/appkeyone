import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";

export async function POST(req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const userId = body.userId;
  if (!userId) return NextResponse.json({ error: "missing userId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { bot: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // Terminate the live session through the SAME proven client the merchant logout
  // uses (DELETE /sessions/{userId}). The previous hand-rolled POST /sessions/logout
  // did not match the service contract, so the DB flipped to disconnected while the
  // real session kept running.
  const waRes: any = await wa.logout(userId).catch(() => ({ ok: false }));

  if (user.bot) {
    await prisma.bot.update({
      where: { id: user.bot.id },
      data: { whatsappStatus: "disconnected", connectionMode: "qr" },
    });
  }

  return NextResponse.json({ ok: true, serviceAck: !!waRes?.ok });
}
