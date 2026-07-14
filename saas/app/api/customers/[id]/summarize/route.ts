// POST /api/customers/[id]/summarize — on-demand conversation summary.
// Bypasses the background rolling-summarizer's message-count threshold for an
// explicit "Summarize Now" action. Read/write only to CustomerMemory — never
// touches the send pipeline.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { summarizeNow } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Tenant-scope check: the customer must belong to the caller.
  const customer = await prisma.customer.findFirst({ where: { id: params.id, userId: uid }, select: { id: true } });
  if (!customer) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const res = await summarizeNow(params.id);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === "in_progress" ? 409 : 422 });
  return NextResponse.json({ ok: true, summary: res.summary });
}
