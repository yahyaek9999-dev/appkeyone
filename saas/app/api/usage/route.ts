// GET /api/usage          → current user's usage summary for billing period
// GET /api/usage?period=YYYY-MM  → specific period
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getUsageSummary } from "@/lib/usage/enforce";
import { getEntitlements } from "@/lib/membership/entitlements";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const uid = ctx.user.id;
  const period = new URL(req.url).searchParams.get("period") ?? undefined;

  const [usage, ents] = await Promise.all([
    getUsageSummary(uid, period),
    getEntitlements(uid),
  ]);

  return NextResponse.json({
    ok: true,
    period: usage.period,
    usage,
    limits: ents.limits,
    tier: ents.tier,
    slug: ents.slug,
  });
}
