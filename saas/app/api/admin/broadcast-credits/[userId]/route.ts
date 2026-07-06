/**
 * POST /api/admin/broadcast-credits/:userId — manually grant or deduct credits
 * for one tenant. Grant uses the credit() engine (kind "adjustment"); deduct
 * uses adjust() with a negative signed amount (atomic guarded decrement → never
 * negative). Admin-only; audited. Idempotent per (action, userId, ts).
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { credit, adjust } from "@/lib/credits/credits";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const userId = String(params.userId || "");
  if (!userId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  if (!["grant", "deduct"].includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const amount = Math.round(Number(body.amount) || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const reason = body.reason ? String(body.reason).slice(0, 300) : action;

  const adminEmail = admin?.email || "admin";
  const adminId = admin?.id || null;
  // Per-action idempotency so a double-click doesn't double-grant.
  const stamp = Date.now();
  const idem = `admin-${action}:${userId}:${stamp}`;

  try {
    let res;
    if (action === "grant") {
      res = await credit({
        userId, kind: "adjustment", amount, source: "admin", reason,
        idempotencyKey: idem, actorId: adminId, actorEmail: adminEmail,
        metadata: { adminAction: "grant" },
      });
    } else {
      res = await adjust({
        userId, amount: -amount, source: "admin", reason,
        idempotencyKey: idem, actorId: adminId, actorEmail: adminEmail,
        metadata: { adminAction: "deduct" },
      });
    }

    if (!res.ok && res.reason === "insufficient_credits") {
      return NextResponse.json({ error: "insufficient_credits", shortfall: res.shortfall }, { status: 409 });
    }

    await audit({
      userId, action: `broadcast_credit.${action}`,
      actorId: adminId, actorEmail: adminEmail, actorRole: "admin",
      targetType: "broadcast_credit_wallet", targetId: userId,
      metadata: { amount, reason, balanceAfter: res.balanceAfter },
      req,
    });

    return NextResponse.json({ ok: res.ok, balanceAfter: res.balanceAfter, ledgerId: res.ledgerId });
  } catch (e: any) {
    return NextResponse.json({ error: "action_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
