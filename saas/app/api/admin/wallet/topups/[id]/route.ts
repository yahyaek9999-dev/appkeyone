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
      // Guard the write with the status we read: two concurrent requests for
      // the same top-up (double-click, stale second tab, or a genuine race
      // with an approve call) both pass the findUnique check above before
      // either writes. Without this WHERE clause, a reject that lands after
      // an approve already credited the wallet would silently overwrite
      // status to "rejected" — leaving the audit trail claiming a top-up
      // was rejected when the money was in fact already credited.
      const upd = await prisma.walletTopupRequest.updateMany({
        where: { id: reqRow.id, status: "pending" },
        data: { status: "rejected", handledBy: adminEmail, handledAt: new Date(), note: body.note ? String(body.note).slice(0, 500) : reqRow.note },
      });
      if (upd.count === 0) {
        const now = await prisma.walletTopupRequest.findUnique({ where: { id: reqRow.id }, select: { status: true } });
        return NextResponse.json({ error: "already_handled", status: now?.status || "unknown" }, { status: 409 });
      }
      await audit({ userId: reqRow.userId, action: "wallet.topup_rejected", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet_topup", targetId: reqRow.id, metadata: { amountUsd: reqRow.amountUsd }, req });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // Same race guard on the approve path: claim the row before crediting so
    // a concurrent reject can't land after we've already paid out.
    const claim = await prisma.walletTopupRequest.updateMany({
      where: { id: reqRow.id, status: "pending" },
      data: { status: "approved", handledBy: adminEmail, handledAt: new Date() },
    });
    if (claim.count === 0) {
      const now = await prisma.walletTopupRequest.findUnique({ where: { id: reqRow.id }, select: { status: true } });
      return NextResponse.json({ error: "already_handled", status: now?.status || "unknown" }, { status: 409 });
    }

    // Credit wallet idempotently (key bound to the request id) — safe even
    // though status is already "approved" above: credit()'s own idempotency
    // key makes a retried/duplicate call to this branch a no-op replay.
    let res: Awaited<ReturnType<typeof credit>>;
    try {
      res = await credit({
        userId: reqRow.userId, kind: "topup", amountUsd: reqRow.amountUsd,
        source: "topup", reason: `topup:${reqRow.method}`,
        idempotencyKey: `topup:${reqRow.id}`, actorId: adminId, actorEmail: adminEmail,
        metadata: { method: reqRow.method, paymentRef: reqRow.paymentRef || "" },
      });
    } catch (creditErr) {
      // We already claimed the row as "approved" above so a concurrent
      // reject can't race in — but if the credit itself fails, leaving it
      // stuck "approved" with no money moved would be worse (looks done,
      // customer never gets their credit, and no one retries because the
      // pending-guarded endpoints above now both reject it as
      // already_handled). Revert to "pending" so this is retryable.
      await prisma.walletTopupRequest.update({
        where: { id: reqRow.id },
        data: { status: "pending", handledBy: null, handledAt: null },
      }).catch(() => {});
      throw creditErr;
    }
    await prisma.walletTopupRequest.update({
      where: { id: reqRow.id },
      data: { ledgerId: res.ledgerId },
    });
    await audit({ userId: reqRow.userId, action: "wallet.topup_approved", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet_topup", targetId: reqRow.id, metadata: { amountUsd: reqRow.amountUsd, balanceAfter: res.balanceAfter }, req });

    // Funds added → try to clear any unbilled Meta debt (best-effort).
    const billed = await billUnbilledForUser(reqRow.userId).catch(() => null);

    return NextResponse.json({ ok: true, status: "approved", balanceAfter: res.balanceAfter, billed });
  } catch (e: any) {
    return NextResponse.json({ error: "action_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
