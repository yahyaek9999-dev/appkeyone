// GET /api/shipments?orderId=  → shipments for an order + available providers
// POST /api/shipments         → create a shipment for an order  (Phase 2)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createShipment } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const orderId = new URL(req.url).searchParams.get("orderId") || undefined;
  const [shipments, providers] = await Promise.all([
    (prisma as any).shipment.findMany({
      where: { userId: uid, ...(orderId ? { orderId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    (prisma as any).shippingProvider.findMany({
      where: { enabled: true },
      select: { id: true, name: true, type: true },
      orderBy: { isDefault: "desc" },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    providers,
    shipments: shipments.map((s: any) => ({
      id: s.id,
      orderId: s.orderId,
      providerType: s.providerType,
      trackingNumber: s.trackingNumber,
      status: s.status,
      timeline: safeParse(s.timelineJson),
      lastSyncAt: s.lastSyncAt,
      createdAt: s.createdAt,
    })),
  });
}

function safeParse(j: string) {
  try {
    return JSON.parse(j || "[]");
  } catch {
    return [];
  }
}

const CreateBody = z.object({
  orderId: z.string().min(1),
  providerId: z.string().min(1),
  trackingNumber: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, {
    name: "shipment-create",
    identifier: uid,
    ...RATE_LIMITS.api,
  });
  if (limited) return limited;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const r = await createShipment(
    {
      userId: uid,
      orderId: parsed.data.orderId,
      providerId: parsed.data.providerId,
      trackingNumber: parsed.data.trackingNumber,
    },
    new Date(),
  );
  if (!r.ok) return NextResponse.json({ error: r.detail }, { status: 400 });
  return NextResponse.json({ ok: true, shipmentId: r.shipmentId, detail: r.detail });
}
