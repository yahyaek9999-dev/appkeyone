// PATCH /api/numbers/:id  → update number (displayName, phone, status, isPrimary, sortOrder)
// DELETE /api/numbers/:id → remove number (only if inactive)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  displayName: z.string().min(1).max(80).optional(),
  phone: z.string().max(20).optional(),
  connectionMethod: z.enum(["bridge", "meta_cloud"]).optional(),
  status: z.enum(["active", "inactive", "connecting", "error", "banned"]).optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  bridgeId: z.string().optional().nullable(),
});

async function getOwnedNumber(uid: string, id: string) {
  return (prisma as any).whatsAppNumber.findFirst({ where: { id, userId: uid } });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isOwner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const number = await getOwnedNumber(ctx.user.id, params.id);
  if (!number) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const { isPrimary, ...rest } = parsed.data;
  const updates: any = { ...rest };

  // If promoting to primary, demote all others
  if (isPrimary === true && !number.isPrimary) {
    await (prisma as any).whatsAppNumber.updateMany({
      where: { userId: ctx.user.id, isPrimary: true },
      data: { isPrimary: false },
    });
    updates.isPrimary = true;
  }

  const updated = await (prisma as any).whatsAppNumber.update({
    where: { id: params.id },
    data: { ...updates, updatedAt: new Date() },
    include: { settings: true },
  });

  return NextResponse.json({ ok: true, number: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isOwner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const number = await getOwnedNumber(ctx.user.id, params.id);
  if (!number) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (number.status === "active") {
    return NextResponse.json({ error: "cannot_delete_active_number" }, { status: 409 });
  }
  if (number.isPrimary) {
    return NextResponse.json({ error: "cannot_delete_primary_number" }, { status: 409 });
  }

  await (prisma as any).whatsAppNumber.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
