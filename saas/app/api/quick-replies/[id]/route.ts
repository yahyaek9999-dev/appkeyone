import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { userId: uid }, select: { id: true } });
  if (!bot) return NextResponse.json({ error: "no_bot" }, { status: 400 });

  const item = await prisma.quickReply.findFirst({
    where: { id: params.id, botId: bot.id },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const data: any = {};
  if (Array.isArray(body.triggers)) {
    data.triggers = JSON.stringify(
      body.triggers.map((s: any) => String(s).trim()).filter(Boolean)
    );
  }
  if (typeof body.reply === "string") data.reply = body.reply.trim();
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;

  await prisma.quickReply.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { userId: uid }, select: { id: true } });
  if (!bot) return NextResponse.json({ error: "no_bot" }, { status: 400 });

  await prisma.quickReply.deleteMany({
    where: { id: params.id, botId: bot.id },
  });
  return NextResponse.json({ ok: true });
}
