/** POST /api/admin/payment-methods/[key] — enable/disable/instructions/label/reorder. Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { setPaymentMethod, reorderMethod } from "@/lib/payments-ops/methods";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { key: string } }) {
  let admin: any = null;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const key = String(params.key || "");
  let body: any = {};
  try { body = await req.json(); } catch {}

  if (body.action === "reorder") {
    const direction = body.direction === "down" ? "down" : "up";
    const r = await reorderMethod(key, direction);
    if (r) await audit({
      userId: admin?.id || "platform", action: "admin.payment_method_changed",
      actorId: admin?.id || null, actorEmail: admin?.email || null, actorRole: "admin",
      targetType: "payment_method", targetId: key, metadata: { op: "reorder", direction },
    });
    return r ? NextResponse.json({ ok: true, method: r }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const m = await setPaymentMethod(key, { enabled: body.enabled, instructions: body.instructions, label: body.label }).catch(() => null);
  if (m) await audit({
    userId: admin?.id || "platform", action: "admin.payment_method_changed",
    actorId: admin?.id || null, actorEmail: admin?.email || null, actorRole: "admin",
    targetType: "payment_method", targetId: key,
    metadata: {
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.instructions !== undefined ? { instructionsChanged: true } : {}),
    },
  });
  return m ? NextResponse.json({ ok: true, method: m }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
