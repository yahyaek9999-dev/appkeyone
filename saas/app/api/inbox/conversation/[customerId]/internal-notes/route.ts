// Growth Suite — internal (admin-only) notes thread on a conversation.
// NEVER sent to the customer. @mentions captured for Phase 2 routing.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

function extractMentions(body: string): string[] {
  const out = new Set<string>();
  const re = /@([\p{L}\p{N}_.-]{2,40})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.add(m[1]);
  return Array.from(out).slice(0, 10);
}

async function resolveConversation(uid: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId: uid },
    include: { conversation: { select: { id: true } } },
  });
  if (!customer) return null;
  let convId = customer.conversation?.id;
  if (!convId) {
    const c = await prisma.conversation.create({ data: { customerId: customer.id } });
    convId = c.id;
  }
  return { customerId: customer.id, convId };
}

export async function GET(_req: Request, props: { params: Promise<{ customerId: string }> }) {
  const params = await props.params;
  const user = await getUserForPermission("inbox");
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, userId: user.id },
    include: { conversation: { select: { id: true } } },
  });
  if (!customer) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const convId = customer.conversation?.id;
  if (!convId) return NextResponse.json({ notes: [] });

  const notes = await (prisma as any).conversationNote.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    notes: notes.map((n: any) => ({
      id: n.id,
      body: n.body,
      authorName: n.authorName,
      mentions: (() => {
        try {
          return JSON.parse(n.mentions || "[]");
        } catch {
          return [];
        }
      })(),
      createdAt: n.createdAt,
    })),
  });
}

export async function POST(req: Request, props: { params: Promise<{ customerId: string }> }) {
  const params = await props.params;
  const user = await getUserForPermission("inbox");
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let b: any = {};
  try {
    b = await req.json();
  } catch {}
  const body = String(b.body || "").trim().slice(0, 2000);
  if (!body) return NextResponse.json({ error: "نص الملاحظة مطلوب" }, { status: 400 });

  const resolved = await resolveConversation(user.id, params.customerId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const note = await (prisma as any).conversationNote.create({
    data: {
      conversationId: resolved.convId,
      customerId: resolved.customerId,
      userId: user.id,
      authorId: user.id,
      authorName: user.name || user.email || "أنا",
      body,
      mentions: JSON.stringify(extractMentions(body)),
    },
  });
  return NextResponse.json({ ok: true, note: { id: note.id, body: note.body, authorName: note.authorName, createdAt: note.createdAt } });
}
