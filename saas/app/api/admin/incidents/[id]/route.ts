/** POST /api/admin/incidents/[id] — resolve an incident (Phase 4). Admin-only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { resolveIncident } from "@/lib/incidents/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (!body.resolution) return NextResponse.json({ error: "resolution_required" }, { status: 400 });
  return NextResponse.json(await resolveIncident(String(params.id), { resolution: String(body.resolution), rootCause: body.rootCause, resolvedByEmail: admin?.email || "admin" }));
}
