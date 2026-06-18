/** POST /api/admin/payment-accounts/[id] — edit/enable/disable/maintenance/archive/default/reorder. Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { setAccount, reorderAccount } from "@/lib/payments-ops/accounts";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const id = String(params.id || "");
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (body.action === "reorder") {
    const r = await reorderAccount(id, body.direction === "down" ? "down" : "up");
    return r ? NextResponse.json({ ok: true, account: r }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const acct = await setAccount(id, { enabled: body.enabled, status: body.status, isDefault: body.isDefault, label: body.label, accountId: body.accountId, note: body.note, assignedStaffId: body.assignedStaffId });
  return acct ? NextResponse.json({ ok: true, account: acct }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
