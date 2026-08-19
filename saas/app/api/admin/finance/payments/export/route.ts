// GET /api/admin/finance/payments/export — server-side CSV export honouring the
// SAME filters as the list endpoint. Bounded (EXPORT_CAP rows) so a broad filter
// can never stream the whole table. Contains no secrets.

import { requireAdmin } from "@/lib/admin";
import { NextResponse } from "next/server";
import { listPayments, parsePaymentFilters } from "@/lib/admin/finance";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const EXPORT_CAP = 5000;
const PAGE = 100;

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" && v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const filters = parsePaymentFilters(new URL(req.url));
  const header = ["id", "createdAt", "tenantEmail", "provider", "status", "amountUsd", "currency", "providerRef", "ledgerId", "failureReason", "reconciledAt"];
  const lines: string[] = [header.join(",")];

  let page = 1;
  let fetched = 0;
  for (;;) {
    const res = await listPayments({ ...filters, page, pageSize: PAGE });
    for (const r of res.rows) {
      lines.push([
        r.id, r.createdAt, r.tenantEmail, r.provider, r.status,
        r.amountUsd, r.currency, r.providerRef, r.ledgerId, r.failureReason, r.reconciledAt,
      ].map(csvCell).join(","));
      fetched++;
      if (fetched >= EXPORT_CAP) break;
    }
    if (fetched >= EXPORT_CAP || page >= res.pages || res.rows.length === 0) break;
    page++;
  }

  void audit({
    userId: admin.id,
    actorId: admin.id,
    actorEmail: (admin as any).email ?? null,
    actorRole: "admin",
    action: "admin.finance.export" as any,
    targetType: "payment",
    targetId: "csv",
    metadata: { rows: fetched, capped: fetched >= EXPORT_CAP, filters },
    req,
  }).catch(() => {});

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payments-export.csv"`,
      "cache-control": "no-store",
    },
  });
}
