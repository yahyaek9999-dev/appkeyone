// GET /api/admin/security — aggregated real security events (filtered, paginated).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getSecurityEvents, type SecurityFilters, type SecuritySeverity } from "@/lib/admin/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }

  const p = new URL(req.url).searchParams;
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
  const sev = p.get("severity");
  const src = p.get("source");
  const filters: SecurityFilters = {
    severity: (["critical", "warn", "info"].includes(sev || "") ? sev : undefined) as SecuritySeverity | undefined,
    source: (["protection", "admin_audit", "api_error"].includes(src || "") ? src : undefined) as any,
    q: p.get("q") || undefined,
    from: p.get("from") || undefined,
    to: p.get("to") || undefined,
    page: num("page") ?? 1,
    pageSize: num("pageSize") ?? 50,
  };

  const result = await getSecurityEvents(filters);
  return NextResponse.json({ ok: true, ...result });
}
