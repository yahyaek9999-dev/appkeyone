import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

const db = prisma as any;

/** Approve / reject. Only owner or admin may decide (team permission). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const g = await apiGate("approval_workflows", "team");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action; // "approve" | "reject"
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  // Only owner/admin can decide. Fail CLOSED if the context can't be resolved
  // (never default to the most-privileged "owner" role).
  const c = await getAuthContext();
  if (!c) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!["owner", "admin"].includes(c.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const decidedBy = c.principalEmail || c.user?.email || "";

  try {
    const existing = await db.approvalRequest.findFirst({ where: { id: params.id, userId: uid } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // 4-eyes control: the requester may not approve/reject their own request.
    if (existing.requestedBy && decidedBy && existing.requestedBy === decidedBy) {
      return NextResponse.json({ error: "self_approval_not_allowed" }, { status: 403 });
    }
    await db.approvalRequest.update({
      where: { id: params.id },
      data: {
        status: action === "approve" ? "approved" : "rejected",
        decidedBy,
        decidedAt: new Date(),
        decisionNote: body.note ? String(body.note).trim() : null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const g = await apiGate("approval_workflows", "team");
  if (g.response) return g.response;
  const uid = g.uid!;
  try {
    await db.approvalRequest.deleteMany({ where: { id: params.id, userId: uid } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}
