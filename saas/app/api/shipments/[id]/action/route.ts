// POST /api/shipments/[id]/action  { action: "sync"|"notify"|"status", status? }
// (Phase 2 — shipment lifecycle: sync from carrier, notify customer, manual status)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import {
  syncShipment,
  notifyCustomerOfShipment,
  updateShipmentStatus,
  SHIPMENT_STATUSES,
} from "@/lib/shipping";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["sync", "notify", "status"]),
  status: z.enum(SHIPMENT_STATUSES).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // shipping_tracking = Pro (tier 2). Mutating a shipment is a paid action.
  const g = await apiGate("shipping_tracking", "customers");
  if (g.response) return g.response;
  const uid = g.uid!;

  // Scope check: shipment must belong to this owner.
  const owned = await (prisma as any).shipment.findFirst({
    where: { id: params.id, userId: uid },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const now = new Date();
  if (parsed.data.action === "sync") {
    const r = await syncShipment(params.id, uid, now);
    return NextResponse.json(r);
  }
  if (parsed.data.action === "notify") {
    const r = await notifyCustomerOfShipment(params.id, uid, now);
    return NextResponse.json({ ok: r.ok, detail: r.ok ? "تم تحديث حالة الإشعار" : "تعذّر" });
  }
  // manual status update
  if (!parsed.data.status) return NextResponse.json({ error: "status_required" }, { status: 400 });
  const r = await updateShipmentStatus(params.id, uid, parsed.data.status, now);
  return NextResponse.json(r);
}
