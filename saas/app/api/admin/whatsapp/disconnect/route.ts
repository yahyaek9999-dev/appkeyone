import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const userId = body.userId;
  if (!userId) return NextResponse.json({ error: "missing userId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { bot: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  if (user.bot) {
    await prisma.bot.update({
      where: { id: user.bot.id },
      data: { whatsappStatus: "disconnected", connectionMode: "qr" },
    });
  }

  try {
    await fetch(
      (process.env.WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001") + "/sessions/logout",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me",
        },
        body: JSON.stringify({ userId }),
      },
    ).catch(() => null);
  } catch {}

  return NextResponse.json({ ok: true });
}
