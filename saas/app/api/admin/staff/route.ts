/** POST /api/admin/staff — create internal staff (Phase 3). Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createStaff } from "@/lib/staff/staff";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (!body.name || !body.email) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const staff = await createStaff({ name: String(body.name), email: String(body.email), role: body.role, departmentKey: body.departmentKey, permissions: Array.isArray(body.permissions) ? body.permissions : [] });
    return NextResponse.json({ ok: true, staff });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 120) }, { status: 400 });
  }
}
