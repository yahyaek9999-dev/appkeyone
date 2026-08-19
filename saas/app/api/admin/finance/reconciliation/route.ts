// GET  /api/admin/finance/reconciliation — detect real mismatches (read-only).
// POST /api/admin/finance/reconciliation — run the EXISTING idempotent sweep
//      (lib/payments reconcilePayments). No new financial engine, no silent fix:
//      only the cases that sweep can safely handle are affected; everything else
//      is reported to the operator as "manual intervention required".

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { reconcilePayments } from "@/lib/payments";
import { detectReconciliationIssues } from "@/lib/admin/finance-reconcile";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const days = Number(new URL(req.url).searchParams.get("days")) || 90;
  const report = await detectReconciliationIssues(days);
  return NextResponse.json({ ok: true, report });
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // BEFORE snapshot so the audit row carries a real change diff.
  const before = await detectReconciliationIssues(90).catch(() => null);

  // Reuse the existing, idempotent sweep — this is the only mutation path.
  const result = await reconcilePayments({});

  const after = await detectReconciliationIssues(90).catch(() => null);

  void audit({
    userId: admin.id,
    actorId: admin.id,
    actorEmail: (admin as any).email ?? null,
    actorRole: "admin",
    action: "admin.finance.reconcile" as any,
    targetType: "payment",
    targetId: "reconciliation",
    metadata: {
      result,
      before: before ? { total: before.counts.total, critical: before.counts.critical } : null,
      after: after ? { total: after.counts.total, critical: after.counts.critical } : null,
    },
    req,
  }).catch(() => {});

  return NextResponse.json({ ok: true, result, report: after });
}
