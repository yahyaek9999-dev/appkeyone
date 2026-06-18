/**
 * Owner API usage dashboard data (Developer Center).
 *   GET /api/developer/usage?days=30 — per-key usage summary + daily series
 *       + recent request log for the tenant.
 *
 * Owner-only + plan-gated ("settings" + "api_access"). All data is tenant-scoped
 * by the engine (WHERE {userId}).
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { getKeyUsage, recentRequests } from "@/lib/developer/metering";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await apiGate("api_access", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days"));
  const days = daysRaw === 7 ? 7 : daysRaw === 90 ? 90 : 30;

  try {
    const [usage, recent] = await Promise.all([
      getKeyUsage(uid, { days }),
      recentRequests(uid, { take: 50 }),
    ]);
    return NextResponse.json({ ok: true, usage, recent });
  } catch (e: any) {
    return NextResponse.json({ error: "usage_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}
