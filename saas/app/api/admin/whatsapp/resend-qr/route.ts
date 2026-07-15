import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "unauthorized" }, { status: authErrorStatus(e) }); }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const userId = body.userId;
  if (!userId) return NextResponse.json({ error: "missing userId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { bot: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // Resend QR = clear any stale session then (re)start so the service emits a fresh
  // QR. Use the same proven client contract (DELETE then POST /sessions/{userId}/start)
  // instead of the old POST /sessions/logout, which the service does not expose.
  await wa.logout(userId).catch(() => null);
  const startRes: any = await wa.start(userId).catch(() => ({ ok: false }));

  if (user.bot) {
    await prisma.bot.update({
      where: { id: user.bot.id },
      data: { whatsappStatus: "connecting" },
    });
  }

  return NextResponse.json({ ok: true, serviceAck: !!startRes?.ok });
}
