// POST /api/knowledge/reindex  { mode?: "full" | "incremental" }
// Rebuilds the tenant's vector index.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { reindex, incrementalIndex } from "@/lib/knowledge-brain/search";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = body?.mode === "incremental" ? await incrementalIndex(uid) : await reindex(uid);
  return NextResponse.json({ ok: true, ...result });
}
