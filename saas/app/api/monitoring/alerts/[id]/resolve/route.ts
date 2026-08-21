// POST /api/monitoring/alerts/[id]/resolve — resolve an alert.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { resolveAlert } from "@/lib/monitoring/engine";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiGate("monitoring_center");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("analytics");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const res = await resolveAlert(uid, params.id);
  if (!res.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(res);
}
