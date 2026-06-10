// AI Sales OS — Funnel Conversion Dashboard data.
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { computeFunnel } from "@/lib/analytics/funnel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await apiGate("advanced_analytics");
  if (gate.response) return gate.response;
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") || "30", 10) || 30));

  try {
    const data = await computeFunnel(uid, days);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: "compute_failed", detail: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
