/**
 * GET /api/admin/wallet — platform-wide wallet + Meta billing analytics.
 * Admin-only. Query: ?days=7|30|90
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getWalletPlatformStats } from "@/lib/wallet/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const url = new URL(req.url);
  const days = url.searchParams.get("days") === "7" ? 7 : url.searchParams.get("days") === "90" ? 90 : 30;
  try {
    const stats = await getWalletPlatformStats({ days });
    return NextResponse.json({ ok: true, stats });
  } catch (e: any) {
    return NextResponse.json({ error: "stats_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}
