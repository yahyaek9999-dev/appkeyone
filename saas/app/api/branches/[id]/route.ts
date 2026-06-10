import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

const db = prisma as any;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const g = await apiGate("multi_branch", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}

  try {
    const existing = await db.branch.findFirst({ where: { id: params.id, userId: uid } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Setting a branch as default clears the flag on the others.
    if (body.isDefault === true) {
      await db.branch.updateMany({ where: { userId: uid }, data: { isDefault: false } });
    }

    const data: any = {};
    for (const k of ["name", "code", "phone", "address", "city", "managerName"]) {
      if (typeof body[k] === "string") data[k] = body[k].trim();
    }
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (typeof body.isDefault === "boolean") data.isDefault = body.isDefault;

    await db.branch.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const g = await apiGate("multi_branch", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;
  try {
    await db.branch.deleteMany({ where: { id: params.id, userId: uid } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}
