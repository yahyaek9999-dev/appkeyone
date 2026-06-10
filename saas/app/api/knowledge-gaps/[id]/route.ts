import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await apiGate("knowledge_base");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action as "resolve" | "dismiss" | "add-knowledge";

  const gap = await prisma.knowledgeGap.findFirst({
    where: { id: ctx.params.id, userId: uid },
  });
  if (!gap) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "add-knowledge") {
    const answer = String(body.answer || "").trim();
    if (!answer) return NextResponse.json({ error: "answer required" }, { status: 400 });

    // Append to a knowledge document — group by "FAQ من المحادثات"
    const existing = await prisma.document.findFirst({
      where: { userId: uid, source: "suggestion" },
      orderBy: { createdAt: "desc" },
    });
    const block = `\n\nس: ${gap.question}\nج: ${answer}`;
    if (existing) {
      await prisma.document.update({
        where: { id: existing.id },
        data: { content: (existing.content + block).slice(0, 60000) },
      });
    } else {
      await prisma.document.create({
        data: {
          userId: uid,
          title: "أسئلة من محادثات العملاء",
          content: ("أسئلة شائعة من العملاء (تمت إضافتها تلقائياً من اقتراحات النظام)" + block).slice(0, 60000),
          source: "suggestion",
        } as any,
      });
    }
    await prisma.knowledgeGap.update({
      where: { id: gap.id },
      data: { resolved: true, resolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "dismiss" || action === "resolve") {
    await prisma.knowledgeGap.update({
      where: { id: gap.id },
      data: { resolved: true, resolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const gate = await apiGate("knowledge_base");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  await prisma.knowledgeGap.deleteMany({
    where: { id: ctx.params.id, userId: uid },
  });
  return NextResponse.json({ ok: true });
}
