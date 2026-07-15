// PATCH/DELETE /api/admin/shipping/providers/[id]  (Phase 2)
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { encryptProviderFields } from "@/lib/shipping";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  apiKey: z.string().max(2000).optional(),
  apiSecret: z.string().max(2000).optional(),
  account: z.string().max(200).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const exists = await (prisma as any).shippingProvider.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: any = { ...encryptProviderFields(parsed.data) };
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.isDefault !== undefined) data.isDefault = parsed.data.isDefault;

  await (prisma as any).shippingProvider.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const exists = await (prisma as any).shippingProvider.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await (prisma as any).shipment
    .updateMany({ where: { providerId: params.id }, data: { providerId: null } })
    .catch(() => {});
  await (prisma as any).shippingProvider.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
