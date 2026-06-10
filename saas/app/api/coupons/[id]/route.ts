// Growth Suite — Coupon update / delete. userId-scoped.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiGate("smart_campaign_builder");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const existing = await prisma.coupon.findFirst({ where: { id: params.id, userId: uid }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let b: any = {};
  try {
    b = await req.json();
  } catch {}
  const data: any = {};
  if (b.type != null) data.type = b.type === "fixed" ? "fixed" : "percent";
  if (b.value != null) {
    let v = Math.max(0, Math.round(Number(b.value) || 0));
    if ((data.type || "percent") === "percent") v = Math.min(100, v);
    data.value = v;
  }
  if (b.active != null) data.active = !!b.active;
  if (b.autoOffer != null) data.autoOffer = !!b.autoOffer;
  if (b.oneTime != null) data.oneTime = !!b.oneTime;
  if (b.usageLimit !== undefined) data.usageLimit = b.usageLimit === "" || b.usageLimit == null ? null : Math.max(1, Math.round(Number(b.usageLimit)));
  if (b.note !== undefined) data.note = b.note ? String(b.note).slice(0, 200) : null;
  if (b.expiresAt !== undefined) {
    if (!b.expiresAt) data.expiresAt = null;
    else {
      const d = new Date(b.expiresAt);
      if (!isNaN(d.getTime())) data.expiresAt = d;
    }
  }

  const coupon = await prisma.coupon.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true, coupon });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiGate("smart_campaign_builder");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const existing = await prisma.coupon.findFirst({ where: { id: params.id, userId: uid }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.coupon.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
