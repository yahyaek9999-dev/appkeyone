/**
 * QR Queue reservations — single-reservation endpoint.
 *
 * GET    → one reservation owned by the caller + its 1-based queue position.
 * DELETE → cancel it (the getUserIdForPermission gate covers this mutation).
 */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { reservationById, queuePositionFor, cancelReservation } from "@/lib/qr-queue";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const reservation = await reservationById(params.id, uid);
  if (!reservation) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const queuePosition = await queuePositionFor(params.id);
  return NextResponse.json({ ok: true, reservation, queuePosition });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const reservation = await cancelReservation(params.id, uid);
  if (!reservation) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, reservation });
}
