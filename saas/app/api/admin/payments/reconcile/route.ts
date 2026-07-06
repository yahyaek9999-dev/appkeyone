/**
 * POST /api/admin/payments/reconcile — run the payment reconciliation sweep
 * (re-credit paid-but-uncredited transactions, expire abandoned intents).
 * Idempotent. Admin-gated by requireAdmin(); audited.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { reconcilePayments } from "@/lib/payments";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const report = await reconcilePayments({});

  void audit({
    userId: admin?.id,
    action: "wallet.payments_reconciled",
    actorId: admin?.id,
    actorEmail: admin?.email,
    actorRole: "admin",
    targetType: "payment",
    targetId: "reconcile",
    metadata: { ...report },
    req,
  });

  return NextResponse.json({ ok: true, report });
}
