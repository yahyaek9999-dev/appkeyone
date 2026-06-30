// Meta analytics (admin). GET ?days=30 → JSON; &format=csv → CSV export.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getMetaAnalytics, analyticsToCsv } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const analytics = await getMetaAnalytics({ days });
  if (url.searchParams.get("format") === "csv") {
    return new NextResponse(analyticsToCsv(analytics), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="meta-analytics-${days}d.csv"`,
      },
    });
  }
  return NextResponse.json({ ok: true, analytics });
}
