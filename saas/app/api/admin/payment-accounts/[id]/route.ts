/** POST /api/admin/payment-accounts/[id] — edit/enable/disable/maintenance/archive/default/reorder. Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { setAccount, reorderAccount } from "@/lib/payments-ops/accounts";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any = null;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const id = String(params.id || "");
  let body: any = {};
  try { body = await req.json(); } catch {}

  if (body.action === "reorder") {
    const direction = body.direction === "down" ? "down" : "up";
    const r = await reorderAccount(id, direction);
    if (r) await audit({
      userId: admin?.id || "platform", action: "admin.payment_account_changed",
      actorId: admin?.id || null, actorEmail: admin?.email || null, actorRole: "admin",
      targetType: "payment_account", targetId: id, metadata: { op: "reorder", direction },
    });
    return r ? NextResponse.json({ ok: true, account: r }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const acct = await setAccount(id, { enabled: body.enabled, status: body.status, isDefault: body.isDefault, label: body.label, accountHolder: body.accountHolder, accountId: body.accountId, instructions: body.instructions, note: body.note, assignedStaffId: body.assignedStaffId });
  if (acct) await audit({
    userId: admin?.id || "platform", action: "admin.payment_account_changed",
    actorId: admin?.id || null, actorEmail: admin?.email || null, actorRole: "admin",
    targetType: "payment_account", targetId: id,
    // Never log the raw receiving-account number — record only that it changed.
    metadata: {
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.accountId !== undefined ? { accountNumberChanged: true } : {}),
      ...(body.assignedStaffId !== undefined ? { assignedStaffId: body.assignedStaffId } : {}),
    },
  });
  return acct ? NextResponse.json({ ok: true, account: acct }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
