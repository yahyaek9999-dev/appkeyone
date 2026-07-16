import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { acknowledgeEscalation, resolveEscalation } from "@/lib/escalation";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["acknowledge", "resolve", "dismiss", "note"]),
  note: z.string().max(1000).optional(),
  resumeAi: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  let user;
  try { user = await requirePermission("escalations"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const ticket = await (prisma as any).escalationTicket.findFirst({ where: { id: ctx.params.id, userId: user.id } }).catch(() => null);
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const timeline = await (prisma as any).escalationTimeline.findMany({ where: { ticketId: ticket.id, userId: user.id }, orderBy: { createdAt: "asc" } }).catch(() => []);
  return NextResponse.json({ ok: true, ticket, timeline });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  let user;
  try { user = await requirePermission("escalations"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  if (parsed.data.action === "acknowledge") {
    const ticket = await acknowledgeEscalation({ userId: user.id, ticketId: ctx.params.id, adminId: user.id, note: parsed.data.note });
    if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, ticket });
  }

  if (parsed.data.action === "resolve" || parsed.data.action === "dismiss") {
    const ticket = await resolveEscalation({ userId: user.id, ticketId: ctx.params.id, adminId: user.id, note: parsed.data.note, resumeAi: parsed.data.resumeAi });
    if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, ticket });
  }

  const existing = await (prisma as any).escalationTicket.findFirst({ where: { id: ctx.params.id, userId: user.id }, select: { id: true } }).catch(() => null);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await (prisma as any).escalationTimeline.create({
      data: { ticketId: ctx.params.id, userId: user.id, kind: "note", actor: "admin", message: parsed.data.note || "ملاحظة" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "note_save_failed", detail: e?.message?.slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
