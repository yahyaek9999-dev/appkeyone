/**
 * POST /api/admin/incidents/[id] — admin actions on an incident:
 *   action=assign   { staffId }   → (re)assign owner
 *   action=priority { priority }  → set priority (resets SLA due date)
 *   else (resolution)             → resolve with notes
 * Admin-only.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { resolveIncident, assignIncident, setIncidentPriority } from "@/lib/incidents/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const id = String(params.id || "");
  let body: any = {};
  try { body = await req.json(); } catch {}

  if (body.action === "assign") {
    if (!body.staffId) return NextResponse.json({ error: "staffId_required" }, { status: 400 });
    return NextResponse.json(await assignIncident(id, String(body.staffId), admin?.email));
  }
  if (body.action === "priority") {
    return NextResponse.json(await setIncidentPriority(id, String(body.priority || ""), admin?.email));
  }
  if (!body.resolution) return NextResponse.json({ error: "resolution_required" }, { status: 400 });
  return NextResponse.json(await resolveIncident(id, { resolution: String(body.resolution), rootCause: body.rootCause, resolvedByEmail: admin?.email || "admin" }));
}
