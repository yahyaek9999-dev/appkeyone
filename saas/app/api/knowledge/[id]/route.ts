import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const { title, content } = await req.json();
  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc || doc.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.document.update({ where: { id: params.id }, data: { title, content } });
  invalidateKnowledgeCache(user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc || doc.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.document.delete({ where: { id: params.id } });
  invalidateKnowledgeCache(user.id);
  return NextResponse.json({ ok: true });
}
