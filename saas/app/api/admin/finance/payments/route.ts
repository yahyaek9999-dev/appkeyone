// GET /api/admin/finance/payments — server-side filtered + paginated payment list.
// Admin-only. Never loads the full payment table; page size is capped in the lib.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { listPayments, parsePaymentFilters } from "@/lib/admin/finance";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await listPayments(parsePaymentFilters(new URL(req.url)));
  return NextResponse.json({ ok: true, ...result });
}
