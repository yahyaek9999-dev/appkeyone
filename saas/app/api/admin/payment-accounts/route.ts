/** POST /api/admin/payment-accounts — create a receiving account (Phase 1). Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (!body.methodKey || !body.label) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const account = await prisma.paymentAccount.create({
    data: { methodKey: String(body.methodKey), label: String(body.label).slice(0, 120), accountId: String(body.accountId || "").slice(0, 200), assignedStaffId: body.assignedStaffId || null, note: String(body.note || "").slice(0, 500) },
  });
  return NextResponse.json({ ok: true, account });
}
