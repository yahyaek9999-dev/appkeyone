/** POST /api/admin/payment-methods/[key] — enable/disable/instructions/label/reorder. Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { setPaymentMethod, reorderMethod } from "@/lib/payments-ops/methods";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { key: string } }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const key = String(params.key || "");
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (body.action === "reorder") {
    const r = await reorderMethod(key, body.direction === "down" ? "down" : "up");
    return r ? NextResponse.json({ ok: true, method: r }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const m = await setPaymentMethod(key, { enabled: body.enabled, instructions: body.instructions, label: body.label }).catch(() => null);
  return m ? NextResponse.json({ ok: true, method: m }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
