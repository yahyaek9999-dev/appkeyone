/**
 * POST /api/admin/payment-reviews/[id] — finance/admin review actions:
 *   action=start_review → move proof to under_review (customer sees it)
 *   decision=approve     → credit wallet + activate membership (idempotent) + audit
 *   decision=reject      → record rejection reason (shown to customer) + audit
 * Gated for platform admin OR finance role (A5 — no owner access required).
 */
import { NextResponse } from "next/server";
import { requireFinanceOrAdmin } from "@/lib/finance/access";
import { reviewPaymentProof, startReview, refundProof } from "@/lib/payments-ops/proofs";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let actor: any;
  try { actor = await requireFinanceOrAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const id = String(params.id || "");
  let body: any = {};
  try { body = await req.json(); } catch {}

  const reviewerName = (actor?.name || actor?.email || "الفريق") as string;
  const reviewerEmail = actor?.email || "admin";

  if (body.action === "start_review") {
    return NextResponse.json(await startReview(id, reviewerName));
  }

  if (body.action === "refund") {
    if (!String(body.reason || "").trim()) return NextResponse.json({ error: "reason_required", message: "سبب الاسترداد مطلوب." }, { status: 400 });
    return NextResponse.json(await refundProof(id, { actorId: actor?.id || null, actorEmail: reviewerEmail, actorRole: actor?.role || "admin", reason: body.reason }));
  }

  const decision = body.decision === "approve" ? "approve" : body.decision === "reject" ? "reject" : null;
  if (!decision) return NextResponse.json({ error: "bad_decision" }, { status: 400 });
  if (decision === "reject" && !String(body.rejectionReason || body.note || "").trim()) {
    return NextResponse.json({ error: "reason_required", message: "سبب الرفض مطلوب ليراه العميل." }, { status: 400 });
  }

  const out = await reviewPaymentProof(id, {
    decision,
    reviewerEmail, reviewerName,
    actorId: actor?.id || null, actorRole: actor?.role || "admin",
    note: body.note,
    rejectionReason: body.rejectionReason,
  });
  return NextResponse.json(out);
}
