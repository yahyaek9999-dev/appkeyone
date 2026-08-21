/** GET /api/qr-queue/availability/day?date=YYYY-MM-DD — hourly slot availability for the booking calendar. */
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { apiGate } from "@/lib/membership/gate";
import { dayAvailability } from "@/lib/qr-queue/capacity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await apiGate("qr_broadcast_queue");
  if (gate.response) return gate.response;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(ctx.role, "broadcasts")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") || "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const day = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  if (isNaN(day.getTime())) return NextResponse.json({ error: "bad_date" }, { status: 400 });

  const { lanes, slots } = await dayAvailability(day);
  return NextResponse.json({ ok: true, date: dateStr || null, lanes, slots });
}
