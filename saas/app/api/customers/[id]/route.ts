import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const customer = await prisma.customer.findFirst({
    where: { id: ctx.params.id, userId: uid },
  });

  if (!customer) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Cascade delete: conversation + messages will be deleted via foreign key
  await prisma.customer.delete({
    where: { id: customer.id },
  });

  return NextResponse.json({ ok: true });
}
