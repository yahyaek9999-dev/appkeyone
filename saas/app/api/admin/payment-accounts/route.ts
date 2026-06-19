/** POST /api/admin/payment-accounts — create a receiving account. Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAccount } from "@/lib/payments-ops/accounts";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let admin: any = null;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (!body.methodKey || !body.label) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const account = await createAccount({
    methodKey: String(body.methodKey), label: String(body.label),
    accountHolder: body.accountHolder, accountId: body.accountId, instructions: body.instructions,
    note: body.note, assignedStaffId: body.assignedStaffId || null,
  });
  await audit({
    userId: admin?.id || "platform", action: "admin.payment_account_changed",
    actorId: admin?.id || null, actorEmail: admin?.email || null, actorRole: "admin",
    targetType: "payment_account", targetId: account.id,
    metadata: { op: "create", methodKey: account.methodKey, label: account.label, accountNumberSet: !!body.accountId },
  });
  return NextResponse.json({ ok: true, account });
}
