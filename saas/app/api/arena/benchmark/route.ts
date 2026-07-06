// GET /api/arena/benchmark — latest Brain Benchmark + AI Readiness + history.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getBenchmarks } from "@/lib/arena/benchmark";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await getBenchmarks(uid);
  return NextResponse.json({ ok: true, ...data });
}
