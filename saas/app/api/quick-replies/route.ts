import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getBotId(uid: string): Promise<string | null> {
  const bot = await prisma.bot.findUnique({ where: { userId: uid }, select: { id: true } });
  return bot?.id || null;
}

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const botId = await getBotId(uid);
  if (!botId) return NextResponse.json({ items: [] });

  const items = await prisma.quickReply.findMany({
    where: { botId },
    orderBy: [{ enabled: "desc" }, { hits: "desc" }],
  });
  return NextResponse.json({
    items: items.map((q: any) => ({
      ...q,
      triggers: safeParse(q.triggers, []),
    })),
  });
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const botId = await getBotId(uid);
  if (!botId) return NextResponse.json({ error: "no_bot" }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const triggersArr = Array.isArray(body.triggers)
    ? body.triggers.map((s: any) => String(s).trim()).filter(Boolean)
    : [];
  const reply = String(body.reply || "").trim();
  if (triggersArr.length === 0 || !reply) {
    return NextResponse.json({ error: "triggers and reply required" }, { status: 400 });
  }

  const created = await prisma.quickReply.create({
    data: {
      botId,
      triggers: JSON.stringify(triggersArr),
      reply,
      enabled: body.enabled !== false,
    },
  });
  return NextResponse.json({ ok: true, item: { ...created, triggers: triggersArr } });
}

function safeParse(s: any, fallback: any) {
  try { return JSON.parse(s); } catch { return fallback; }
}
