/**
 * POST /api/admin/broadcast-credits/purchases/:id — approve or reject a
 * broadcast-credit purchase request. Approving grants credits with a "purchase"
 * ledger entry (idempotent per request id) and links the ledger back to the
 * request. Admin-only; audited. Mirrors the wallet top-up approval flow.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { credit } from "@/lib/credits/credits";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const reqRow = await prisma.broadcastCreditPurchaseRequest.findUnique({ where: { id: params.id } });
  if (!reqRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (reqRow.status !== "pending") {
    return NextResponse.json({ error: "already_handled", status: reqRow.status }, { status: 409 });
  }

  const adminEmail = admin?.email || "admin";
  const adminId = admin?.id || null;

  try {
    if (action === "reject") {
      await prisma.broadcastCreditPurchaseRequest.update({
        where: { id: reqRow.id },
        data: { status: "rejected", handledBy: adminEmail, handledAt: new Date() },
      });
      await audit({
        userId: reqRow.userId, action: "broadcast_credit.purchase_rejected",
        actorId: adminId, actorEmail: adminEmail, actorRole: "admin",
        targetType: "broadcast_credit_purchase", targetId: reqRow.id,
        metadata: { credits: reqRow.credits }, req,
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // Approve → grant credits idempotently (key bound to the request id).
    const res = await credit({
      userId: reqRow.userId, kind: "purchase", amount: reqRow.credits,
      source: "purchase", reason: `purchase:${reqRow.method}`,
      idempotencyKey: `credit-purchase:${reqRow.id}`, actorId: adminId, actorEmail: adminEmail,
      metadata: { method: reqRow.method, amountUsd: reqRow.amountUsd, paymentRef: reqRow.paymentRef || "" },
    });
    await prisma.broadcastCreditPurchaseRequest.update({
      where: { id: reqRow.id },
      data: { status: "approved", handledBy: adminEmail, handledAt: new Date(), ledgerId: res.ledgerId },
    });
    await audit({
      userId: reqRow.userId, action: "broadcast_credit.purchase_approved",
      actorId: adminId, actorEmail: adminEmail, actorRole: "admin",
      targetType: "broadcast_credit_purchase", targetId: reqRow.id,
      metadata: { credits: reqRow.credits, balanceAfter: res.balanceAfter }, req,
    });

    return NextResponse.json({ ok: true, status: "approved", balanceAfter: res.balanceAfter });
  } catch (e: any) {
    return NextResponse.json({ error: "action_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
