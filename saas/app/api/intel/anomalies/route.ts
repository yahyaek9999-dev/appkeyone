// Phase 4 — Real-time Business Intelligence: anomaly feed endpoint.
// Read-only GET. Composes detectAnomalies (which itself only reads). Auth
// guarded. NEVER 500s — any internal failure degrades to a 200 with an empty
// feed flagged { degraded: true } so the dashboard always renders.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { detectAnomalies } from "@/lib/intelligence/anomalies";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await apiGate("advanced_insights");
  if (gate.response) return gate.response;
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  try {
    const report = await detectAnomalies(uid);
    return NextResponse.json(report);
  } catch (e) {
    // Intelligence is best-effort: never block the screen on a derivation error.
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      anomalies: [],
      summary: { revenueTrend: "flat", riskLevel: "low" },
      forecast: null,
      degraded: true,
    });
  }
}
