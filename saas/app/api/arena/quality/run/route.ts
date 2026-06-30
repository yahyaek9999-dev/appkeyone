// POST /api/arena/quality/run — compute + persist a quality benchmark.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { computeQuality } from "@/lib/arena/quality";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const result = await computeQuality(uid);
  return NextResponse.json({ ok: true, ...result });
}
