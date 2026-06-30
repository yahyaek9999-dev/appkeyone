// GET /api/admin/ai-control/export?window=today|week|month
// CSV of real per-customer token usage + cost (from getTenantCosts).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getTenantCosts } from "@/lib/observability/tenant-costs";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const win = new URL(req.url).searchParams.get("window") || "month";
  const days = win === "today" ? 1 : win === "week" ? 7 : 30;
  const cost = await getTenantCosts({ days }).catch(() => null);
  const rows = cost?.rows || [];

  const header = [
    "email",
    "name",
    "llmCalls",
    "llmFailures",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "estUsd",
  ];
  const lines = [header.join(",")];
  for (const r of rows as any[]) {
    lines.push(
      [
        r.email,
        r.name,
        r.llmCalls,
        r.llmFailures,
        r.inputTokens,
        r.outputTokens,
        r.totalTokens,
        r.estUsd,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = lines.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-token-usage-${win}.csv"`,
    },
  });
}
