// Meta Enterprise — background worker cron. Triggered by a scheduled task on
// the VPS (suggested cadence: every 15 min). One idempotent tick: recover (DLQ)
// → settle charges → rollups → health sweep → cleanup. Internal-secret gated.
import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";
import { runMetaCronTick } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const maxTenants = Number(url.searchParams.get("maxTenants")) || undefined;
  try {
    const res = await runMetaCronTick({ maxTenants });
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
