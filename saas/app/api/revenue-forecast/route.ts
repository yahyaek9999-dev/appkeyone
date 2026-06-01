// AI Sales OS — Revenue Forecast data.
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { computeForecast } from "@/lib/analytics/forecast";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  try {
    const data = await computeForecast(uid);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: "compute_failed", detail: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
