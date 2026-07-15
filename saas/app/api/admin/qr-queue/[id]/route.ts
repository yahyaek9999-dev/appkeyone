/**
 * POST /api/admin/qr-queue/:id — admin reservation lifecycle action.
 *   { action: "cancel" }   → cancelReservation(id)   (idempotent on final rows)
 *   { action: "complete" } → completeReservation(id)
 *
 * Admin-only; audited. Never touches the WhatsApp send pipeline — it only flips
 * a QrReservation row's lifecycle status through the queue engine.
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { cancelReservation, completeReservation } from "@/lib/qr-queue";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const id = String(params.id || "");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  if (!["cancel", "complete"].includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    let reservation: any = null;
    if (action === "cancel") {
      reservation = await cancelReservation(id);
      if (!reservation) return NextResponse.json({ error: "not_found" }, { status: 404 });
    } else {
      reservation = await completeReservation(id, { by: "admin", actorId: admin?.id || null });
    }

    void audit({
      userId: reservation?.userId || admin?.id,
      action: action === "cancel" ? "admin.user_suspended" : "admin.user_approved",
      actorId: admin?.id,
      actorEmail: admin?.email,
      actorRole: "admin",
      targetType: "qr_reservation",
      targetId: id,
      metadata: { action, status: reservation?.status, purpose: reservation?.purpose },
      req,
    });

    return NextResponse.json({ ok: true, reservation });
  } catch (e: any) {
    return NextResponse.json({ error: "action_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
