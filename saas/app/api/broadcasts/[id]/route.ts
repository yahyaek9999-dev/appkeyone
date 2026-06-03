import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const bc = await prisma.broadcast.findFirst({
    where: { id: ctx.params.id, userId: uid },
    include: {
      items: {
        orderBy: [{ status: "asc" }, { sentAt: "desc" }],
        take: 200,
      },
    },
  });
  if (!bc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ broadcast: bc });
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");

  const bc = await prisma.broadcast.findFirst({
    where: { id: ctx.params.id, userId: uid },
  });
  if (!bc) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "cancel") {
    await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: "canceled", finishedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  await prisma.broadcast.deleteMany({
    where: { id: ctx.params.id, userId: uid },
  });
  return NextResponse.json({ ok: true });
}
