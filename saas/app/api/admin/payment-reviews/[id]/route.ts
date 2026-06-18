/** POST /api/admin/payment-reviews/[id] — staff approve/reject (Phase 1/2). Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { reviewPaymentProof } from "@/lib/payments-ops/proofs";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  let body: any = {};
  try { body = await req.json(); } catch {}
  const decision = body.decision === "approve" ? "approve" : body.decision === "reject" ? "reject" : null;
  if (!decision) return NextResponse.json({ error: "bad_decision" }, { status: 400 });
  const out = await reviewPaymentProof(String(params.id), { decision, reviewerEmail: admin?.email || "admin", note: body.note });
  return NextResponse.json(out);
}
