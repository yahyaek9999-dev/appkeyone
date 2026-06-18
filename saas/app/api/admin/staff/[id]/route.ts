/** POST /api/admin/staff/[id] — suspend or assign staff (Phase 2/3). Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { suspendStaff, assignStaff } from "@/lib/staff/staff";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const id = String(params.id || "");
  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  if (action === "suspend") return NextResponse.json({ ok: true, staff: await suspendStaff(id, body.suspend !== false) });
  if (action === "assign") {
    if (!body.kind || !body.refKey) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    return NextResponse.json({ ok: true, assignment: await assignStaff(id, String(body.kind), String(body.refKey), String(body.note || "")) });
  }
  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
