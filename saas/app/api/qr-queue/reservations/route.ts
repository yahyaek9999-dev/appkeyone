/**
 * QR Queue reservations — tenant collection endpoint.
 *
 * GET  → the caller's own reservations.
 * POST → book a slot on the finite QR session pool. On rejection returns 409 with
 *        the engine reason + an optional suggested ISO start. Never sends WhatsApp.
 */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { bookReservation, myReservations } from "@/lib/qr-queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await apiGate("qr_broadcast_queue");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const reservations = await myReservations(uid);
  return NextResponse.json({ ok: true, reservations });
}

export async function POST(req: Request) {
  const gate = await apiGate("qr_broadcast_queue");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const windowStart = new Date(body?.windowStart);
  if (isNaN(windowStart.getTime())) {
    return NextResponse.json({ error: "invalid_start" }, { status: 400 });
  }

  let windowEnd: Date | null = null;
  if (body?.windowEnd != null && body?.windowEnd !== "") {
    const we = new Date(body.windowEnd);
    if (isNaN(we.getTime())) {
      return NextResponse.json({ error: "invalid_window" }, { status: 400 });
    }
    windowEnd = we;
  }

  const durationMin =
    body?.durationMin != null && body?.durationMin !== ""
      ? Number(body.durationMin)
      : undefined;

  const result = await bookReservation({
    userId: uid,
    purpose: body?.purpose,
    windowStart,
    windowEnd,
    durationMin: Number.isFinite(durationMin as number) ? durationMin : undefined,
    note: typeof body?.note === "string" ? body.note : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, suggestionISO: result.suggestionISO ?? null },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, reservation: result.reservation });
}
