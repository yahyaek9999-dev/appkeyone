// POST /api/escalations/[id]/draft-reply — generate an AI-suggested reply for
// a human agent to review/send manually. Draft-only, never auto-sent.
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { generateEscalationDraftReply } from "@/lib/support/draft-reply";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  let user;
  try { user = await requirePermission("escalations"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const res = await generateEscalationDraftReply(user.id, ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 422 });
  return NextResponse.json({ ok: true, draft: res.draft });
}
