// AI Sales OS — Customer Segmentation data.
//   GET /api/segments            → all segment cards
//   GET /api/segments?key=vip    → reachable members of one segment (open/filter)
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { apiGate } from "@/lib/membership/gate";
import { computeSegments, resolveSegmentCustomers } from "@/lib/analytics/segments";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await apiGate("segments");
  if (gate.response) return gate.response;
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const limited = enforceRateLimit(req, { name: "segments", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const key = new URL(req.url).searchParams.get("key");
  try {
    if (key) {
      const members = await resolveSegmentCustomers(uid, key, { limit: 500, reachableOnly: false });
      return NextResponse.json({ key, count: members.length, members });
    }
    const data = await computeSegments(uid);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: "compute_failed", detail: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
