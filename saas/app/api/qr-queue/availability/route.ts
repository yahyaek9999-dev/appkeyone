/**
 * QR Queue availability — read-only capacity probe for a candidate window.
 *
 * GET ?start=<ISO>&durationMin=<n> → lane/peak/availability for [start, start+dur]
 * plus a suggested next ISO start when the window can't be booked.
 */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { checkAvailability, suggestNextSlot, qrQueueFlags } from "@/lib/qr-queue";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  const startRaw = searchParams.get("start");
  const start = new Date(startRaw ?? "");
  if (isNaN(start.getTime())) {
    return NextResponse.json({ error: "invalid_start" }, { status: 400 });
  }

  const durRaw = searchParams.get("durationMin");
  const durationMin =
    durRaw != null && durRaw !== "" && Number.isFinite(Number(durRaw))
      ? Number(durRaw)
      : qrQueueFlags.defaultDurationMin;

  const windowEnd = new Date(start.getTime() + durationMin * 60_000);

  const availability = await checkAvailability(start, windowEnd);

  let suggestionISO: string | null = null;
  if (!availability.canBook) {
    const next = await suggestNextSlot(start, durationMin);
    suggestionISO = next ? next.toISOString() : null;
  }

  return NextResponse.json({ ok: true, durationMin, ...availability, suggestionISO });
}
