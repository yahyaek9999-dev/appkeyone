// GET /api/knowledge/graph — nodes + edges + statistics.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getGraph } from "@/lib/knowledge-brain/graph";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const graph = await getGraph(uid);
  return NextResponse.json({ ok: true, ...graph });
}
