/**
 * /api/import/recovery — the ONLY way a Bridge tenant may obtain a QR session,
 * and only for the duration of Recovery.
 *
 * GET    poll the temporary session: { state, qr, error, expiresAt, session }
 * POST   { action: "start" }   create it — requires an explicit customer action
 *        { action: "cancel" }  tear it down now
 *
 * Deliberate limits, because this endpoint hands out a QR to a tenant whose
 * normal QR flow is hidden:
 *   - owner-scoped by the same "customers" permission the Import page uses, so
 *     it can never reach another tenant
 *   - refuses anyone who is not on Bridge; a QR tenant keeps the normal path
 *     and gets 409 here rather than a second way in
 *   - starts nothing on GET — opening the Recovery page must not silently link
 *     a device
 *   - returns the QR only while the session is genuinely waiting to be scanned
 */
import { NextResponse } from "next/server";
import { getUserForPermission } from "@/lib/auth";
import {
  startRecoverySession,
  pollRecoverySession,
  cancelRecoverySession,
  isRecoveryTenant,
} from "@/lib/import/recovery-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserForPermission("customers");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!(await isRecoveryTenant(user.id))) {
    return NextResponse.json({ error: "recovery_not_applicable" }, { status: 409 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await pollRecoverySession(user.id)) });
  } catch (e: any) {
    return NextResponse.json({ error: "recovery_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getUserForPermission("customers");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A QR tenant must not gain a second, differently-shaped entry point.
  if (!(await isRecoveryTenant(user.id))) {
    return NextResponse.json({ error: "recovery_not_applicable" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String((body as any)?.action || "");

  try {
    if (action === "start") {
      return NextResponse.json({ ok: true, ...(await startRecoverySession(user.id)) });
    }
    if (action === "cancel") {
      return NextResponse.json({ ok: true, ...(await cancelRecoverySession(user.id)) });
    }
    return NextResponse.json({ error: "bad_action", detail: "action must be start|cancel" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: "recovery_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
