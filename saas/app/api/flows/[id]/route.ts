import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

const db = prisma as any;

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const g = await apiGate("flow_builder", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}

  try {
    const existing = await db.flowDefinition.findFirst({
      where: { id: ctx.params.id, userId: uid },
    });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const data: any = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.description === "string") data.description = body.description.trim();
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (typeof body.trigger === "string") data.trigger = body.trigger;
    if (typeof body.graphJson === "string") {
      data.graphJson = body.graphJson;
      data.version = (existing.version || 1) + 1;
    }
    await db.flowDefinition.update({ where: { id: ctx.params.id }, data });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const g = await apiGate("flow_builder", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;
  try {
    await db.flowDefinition.deleteMany({ where: { id: ctx.params.id, userId: uid } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}
