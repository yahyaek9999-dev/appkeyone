// POST /api/admin/jobs/run  { endpoint }  → triggers a real cron job now.
//
// This does NOT re-implement any job. It calls the SAME internal cron route the
// systemd timer calls (POST /api/cron/<endpoint> with x-internal-secret), so the
// manual run and the scheduled run take the identical code path. Admin-only,
// audited, and validated against the known registry (no arbitrary endpoint).

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { CRON_ENDPOINTS } from "@/lib/admin/jobs-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const secret = process.env.SAAS_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "SAAS_INTERNAL_SECRET not configured — cannot trigger jobs" },
      { status: 503 },
    );
  }

  let endpoint = "";
  try {
    const body = await req.json();
    endpoint = String(body?.endpoint || "");
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!CRON_ENDPOINTS.has(endpoint)) {
    return NextResponse.json({ ok: false, error: "unknown_job" }, { status: 404 });
  }

  const port = process.env.PORT || "3000";
  const url = `http://127.0.0.1:${port}/api/cron/${endpoint}`;
  const startedAt = Date.now();

  let status = 0;
  let result: unknown = null;
  let errText: string | null = null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "x-internal-secret": secret, "content-type": "application/json" },
      // Cron jobs are bounded server-side; cap the manual trigger at 55s like
      // the systemd script does so a stuck job can't hang the admin request.
      signal: AbortSignal.timeout(55_000),
    });
    status = r.status;
    result = await r.json().catch(() => null);
    if (!r.ok) errText = `HTTP ${r.status}`;
  } catch (e: any) {
    errText = e?.name === "TimeoutError" ? "timeout" : e?.message || "trigger_failed";
  }

  const durationMs = Date.now() - startedAt;
  const ok = status === 200 && !errText;

  void audit({
    userId: admin.id,
    actorId: admin.id,
    actorEmail: (admin as any).email ?? null,
    actorRole: "admin",
    action: "admin.job.run",
    targetType: "cron",
    targetId: endpoint,
    metadata: { ok, status, durationMs, error: errText },
    req,
  }).catch(() => {});

  return NextResponse.json({ ok, endpoint, status, durationMs, result, error: errText });
}
