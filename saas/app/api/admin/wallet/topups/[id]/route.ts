/**
 * POST /api/admin/wallet/topups/:id — approve or reject a top-up request.
 * Approving credits the wallet with a `topup` ledger entry (idempotent per
 * request) and links the ledger back to the request, then retries any unbilled
 * Meta charges. Admin-only; audited.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { credit } from "@/lib/wallet/wallet";
import { billUnbilledForUser } from "@/lib/wallet/meta-cost";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  if (!["approve", "reject"].includes(action)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const reqRow = await prisma.walletTopupRequest.findUnique({ where: { id: params.id } });
  if (!reqRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (reqRow.status !== "pending") return NextResponse.json({ error: "already_handled", status: reqRow.status }, { status: 409 });

  const adminEmail = admin?.email || "admin";
  const adminId = admin?.id || null;

  try {
    if (action === "reject") {
      await prisma.walletTopupRequest.update({
        where: { id: reqRow.id },
        data: { status: "rejected", handledBy: adminEmail, handledAt: new Date(), note: body.note ? String(body.note).slice(0, 500) : reqRow.note },
      });
      await audit({ userId: reqRow.userId, action: "wallet.topup_rejected", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet_topup", targetId: reqRow.id, metadata: { amountUsd: reqRow.amountUsd }, req });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // Approve → credit wallet idempotently (key bound to the request id).
    const res = await credit({
      userId: reqRow.userId, kind: "topup", amountUsd: reqRow.amountUsd,
      source: "topup", reason: `topup:${reqRow.method}`,
      idempotencyKey: `topup:${reqRow.id}`, actorId: adminId, actorEmail: adminEmail,
      metadata: { method: reqRow.method, paymentRef: reqRow.paymentRef || "" },
    });
    await prisma.walletTopupRequest.update({
      where: { id: reqRow.id },
      data: { status: "approved", handledBy: adminEmail, handledAt: new Date(), ledgerId: res.ledgerId },
    });
    await audit({ userId: reqRow.userId, action: "wallet.topup_approved", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet_topup", targetId: reqRow.id, metadata: { amountUsd: reqRow.amountUsd, balanceAfter: res.balanceAfter }, req });

    // Funds added → try to clear any unbilled Meta debt (best-effort).
    const billed = await billUnbilledForUser(reqRow.userId).catch(() => null);

    return NextResponse.json({ ok: true, status: "approved", balanceAfter: res.balanceAfter, billed });
  } catch (e: any) {
    return NextResponse.json({ error: "action_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
